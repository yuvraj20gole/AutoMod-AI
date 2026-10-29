"""Job queue unit tests — mocked Detailed runner, no model load."""

from __future__ import annotations

import threading
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image

from job_queue import JobQueue, JobStatus


@pytest.fixture
def q(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOMOD_JOB_DIR", str(tmp_path / "jobs"))
    # Re-bind JOB_DIR after env set — job_queue reads it at import time.
    import job_queue as jq

    monkeypatch.setattr(jq, "JOB_DIR", tmp_path / "jobs")
    queue = JobQueue()
    queue.start()
    return queue


def _wait(queue: JobQueue, job_id: str, timeout: float = 5.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        snap = queue.snapshot(job_id)
        if snap and snap["status"] in ("done", "failed"):
            return
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not finish: {queue.snapshot(job_id)}")


def test_detailed_state_transitions(q, tmp_path):
    import job_queue as jq

    inp = tmp_path / "in.png"
    Image.new("RGB", (32, 24), (80, 80, 80)).save(inp)
    out_bytes = b"fake-png"

    def fake_run(_self, job):
        jq.JOB_DIR.mkdir(parents=True, exist_ok=True)
        target = jq.JOB_DIR / f"{job.id}.png"
        target.write_bytes(out_bytes)
        job.result_path = str(target)
        job.result_bytes = out_bytes

    with patch.object(JobQueue, "_run_detailed", fake_run):
        job = q.enqueue_detailed(input_path=inp, part="lip_spoiler", seed=7)
        assert job.status == JobStatus.queued
        _wait(q, job.id)
    snap = q.snapshot(job.id)
    assert snap["status"] == "done"
    assert snap["started_at"] and snap["finished_at"]
    assert snap["part"] == "lip_spoiler"
    assert q.get(job.id).result_bytes == out_bytes


def test_detailed_failure_marks_failed(q, tmp_path):
    inp = tmp_path / "in.png"
    Image.new("RGB", (16, 16), (10, 10, 10)).save(inp)

    def boom(_self, job):
        raise RuntimeError("runner exploded")

    with patch.object(JobQueue, "_run_detailed", boom):
        job = q.enqueue_detailed(input_path=inp, part="ducktail")
        _wait(q, job.id)
    snap = q.snapshot(job.id)
    assert snap["status"] == "failed"
    assert "runner exploded" in (snap["error"] or "")


def test_one_job_at_a_time_engine_lock(q, tmp_path):
    """Holding engine_lock (as Fast /edit does) blocks the Detailed worker."""
    release = threading.Event()
    held = threading.Event()

    def hold_lock():
        with q.engine_lock:
            held.set()
            release.wait(timeout=3)

    t = threading.Thread(target=hold_lock, daemon=True)
    t.start()
    assert held.wait(timeout=2)

    entered = threading.Event()

    def fake_run(_self, job):
        entered.set()
        import job_queue as jq

        jq.JOB_DIR.mkdir(parents=True, exist_ok=True)
        out = jq.JOB_DIR / f"{job.id}.png"
        out.write_bytes(b"ok")
        job.result_path = str(out)
        job.result_bytes = b"ok"

    inp = tmp_path / "in.png"
    Image.new("RGB", (8, 8), (1, 2, 3)).save(inp)

    with patch.object(JobQueue, "_run_detailed", fake_run):
        job = q.enqueue_detailed(input_path=inp, part="gt_wing")
        time.sleep(0.15)
        # Worker is blocked on engine_lock before _run_detailed runs.
        assert not entered.is_set()
        assert q.get(job.id).status == JobStatus.running
        release.set()
        _wait(q, job.id)

    assert entered.is_set()
    assert q.snapshot(job.id)["status"] == "done"
    t.join(timeout=2)


def test_compare_queue_orders_fast_then_detailed(q, tmp_path):
    """Compare engines: both edits go through the same worker — never concurrent."""
    order: list[str] = []
    active = 0
    max_active = 0
    lock = threading.Lock()

    def fake_detailed(_self, job):
        nonlocal active, max_active
        with lock:
            active += 1
            max_active = max(max_active, active)
            order.append("detailed")
        time.sleep(0.05)
        import job_queue as jq

        jq.JOB_DIR.mkdir(parents=True, exist_ok=True)
        out = jq.JOB_DIR / f"{job.id}.png"
        out.write_bytes(b"d")
        job.result_path = str(out)
        job.result_bytes = b"d"
        with lock:
            active -= 1

    def fake_fast():
        nonlocal active, max_active
        with lock:
            active += 1
            max_active = max(max_active, active)
            order.append("fast")
        time.sleep(0.05)
        with lock:
            active -= 1
        return b"f"

    inp = tmp_path / "in.png"
    Image.new("RGB", (8, 8), (1, 1, 1)).save(inp)

    with patch.object(JobQueue, "_run_detailed", fake_detailed):
        j_fast = q.enqueue_fast(fast_fn=fake_fast)
        j_det = q.enqueue_detailed(input_path=inp, part="ducktail")
        _wait(q, j_fast.id)
        _wait(q, j_det.id)

    assert max_active == 1
    assert order == ["fast", "detailed"]
    assert q.snapshot(j_fast.id)["status"] == "done"
    assert q.snapshot(j_det.id)["status"] == "done"


def test_timeout_kills_subprocess(q, tmp_path, monkeypatch):
    import job_queue as jq
    import subprocess

    monkeypatch.setattr(jq, "DETAILED_TIMEOUT_SEC", 1)
    inp = tmp_path / "in.png"
    Image.new("RGB", (8, 8), (0, 0, 0)).save(inp)

    class SlowProc:
        returncode = None

        def communicate(self, timeout=None):
            if timeout is not None and timeout <= 1:
                raise subprocess.TimeoutExpired(cmd=["x"], timeout=timeout)
            self.returncode = -9
            return ("killed", None)

        def kill(self):
            self.returncode = -9

    with patch.object(jq.subprocess, "Popen", return_value=SlowProc()):
        with patch("qwen.availability.mflux_python", return_value="python3"):
            job = q.enqueue_detailed(input_path=inp, part="lip_spoiler")
            _wait(q, job.id, timeout=5)

    snap = q.snapshot(job.id)
    assert snap["status"] == "failed"
    assert "timed out" in (snap["error"] or "").lower()
