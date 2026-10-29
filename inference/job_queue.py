"""Single shared job queue for Fast + Detailed engines.

Only one edit runs at a time (Fast holds the same lock as Detailed so the
48 GB Mac never loads InstructPix2Pix and Qwen together).
"""

from __future__ import annotations

import os
import subprocess
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from PIL import Image


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


@dataclass
class Job:
    id: str
    engine: str  # fast | detailed
    part: str | None = None
    category: str | None = None
    option: str | None = None
    seed: int | None = None
    status: JobStatus = JobStatus.queued
    error: str | None = None
    result_path: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: str | None = None
    finished_at: str | None = None
    input_path: str | None = None
    # Fast path: callables filled by server
    fast_fn: Callable[[], bytes] | None = None
    result_bytes: bytes | None = None


DETAILED_TIMEOUT_SEC = int(os.environ.get("AUTOMOD_DETAILED_TIMEOUT", "900"))  # 15 min
JOB_DIR = Path(os.environ.get("AUTOMOD_JOB_DIR", "/tmp/automod_jobs"))


class JobQueue:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._q: list[str] = []
        self._cv = threading.Condition()
        self._engine_lock = threading.Lock()  # exclusive Fast or Detailed
        self._worker = threading.Thread(target=self._loop, name="automod-job-worker", daemon=True)
        self._started = False

    def start(self) -> None:
        with self._cv:
            if not self._started:
                self._started = True
                self._worker.start()

    @property
    def engine_lock(self) -> threading.Lock:
        return self._engine_lock

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def snapshot(self, job_id: str) -> dict[str, Any] | None:
        job = self._jobs.get(job_id)
        if not job:
            return None
        return {
            "id": job.id,
            "engine": job.engine,
            "part": job.part,
            "category": job.category,
            "option": job.option,
            "seed": job.seed,
            "status": job.status.value,
            "error": job.error,
            "result_path": job.result_path,
            "created_at": job.created_at,
            "started_at": job.started_at,
            "finished_at": job.finished_at,
        }

    def enqueue_detailed(
        self,
        *,
        input_path: Path,
        part: str,
        seed: int | None = None,
        job_id: str | None = None,
    ) -> Job:
        jid = job_id or str(uuid.uuid4())
        job = Job(
            id=jid,
            engine="detailed",
            part=part,
            seed=seed,
            input_path=str(input_path),
        )
        with self._cv:
            self._jobs[jid] = job
            self._q.append(jid)
            self._cv.notify()
        return job

    def enqueue_fast(self, *, fast_fn: Callable[[], bytes], job_id: str | None = None) -> Job:
        jid = job_id or str(uuid.uuid4())
        job = Job(id=jid, engine="fast", fast_fn=fast_fn)
        with self._cv:
            self._jobs[jid] = job
            self._q.append(jid)
            self._cv.notify()
        return job

    def _loop(self) -> None:
        while True:
            with self._cv:
                while not self._q:
                    self._cv.wait()
                jid = self._q.pop(0)
                job = self._jobs[jid]
            self._run(job)

    def _run(self, job: Job) -> None:
        job.status = JobStatus.running
        job.started_at = datetime.now(timezone.utc).isoformat()
        try:
            with self._engine_lock:
                if job.engine == "detailed":
                    self._run_detailed(job)
                else:
                    self._run_fast(job)
            job.status = JobStatus.done
        except Exception as e:
            job.status = JobStatus.failed
            job.error = f"{type(e).__name__}: {e}"
            traceback.print_exc()
        finally:
            job.finished_at = datetime.now(timezone.utc).isoformat()

    def _run_fast(self, job: Job) -> None:
        assert job.fast_fn is not None
        job.result_bytes = job.fast_fn()

    def _run_detailed(self, job: Job) -> None:
        assert job.input_path and job.part
        JOB_DIR.mkdir(parents=True, exist_ok=True)
        out = JOB_DIR / f"{job.id}.png"
        runner = Path(__file__).resolve().parent / "qwen" / "runner.py"
        # Prefer mflux's Python so the import works
        from qwen.availability import mflux_python

        py = mflux_python() or "python3"
        cmd = [
            py,
            str(runner),
            "--input",
            job.input_path,
            "--output",
            str(out),
            "--part",
            job.part,
        ]
        if job.seed is not None:
            cmd += ["--seed", str(job.seed)]
        env = os.environ.copy()
        env.setdefault("PYTHONUNBUFFERED", "1")
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
        )
        try:
            stdout, _ = proc.communicate(timeout=DETAILED_TIMEOUT_SEC)
        except subprocess.TimeoutExpired:
            proc.kill()
            try:
                proc.communicate(timeout=10)
            except Exception:
                pass
            raise TimeoutError(f"Detailed job timed out after {DETAILED_TIMEOUT_SEC}s")
        if stdout:
            print(stdout[-4000:], flush=True)
        if proc.returncode != 0:
            raise RuntimeError(f"runner exited {proc.returncode}: {(stdout or '')[-1500:]}")
        if not out.is_file():
            raise RuntimeError("runner reported success but output file missing")
        job.result_path = str(out)
        job.result_bytes = out.read_bytes()


# Process-wide singleton
queue = JobQueue()
