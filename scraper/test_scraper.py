"""Unit tests for scraper components."""

import shutil
import tempfile
from pathlib import Path
import unittest
from PIL import Image, ImageDraw

from scraper.dedup import PerceptualDedupIndex
from scraper.image_utils import (
    validate_image_dimensions,
    is_side_by_side_collage,
    split_horizontal_collage,
    is_likely_full_shot,
)
from scraper.shop_collector import is_excluded_treatment
from scraper.storage import DatasetStorage
from scraper.vision_validator import VisionPairValidator
from scraper.review_generator import generate_review_html


class TestScraperPipeline(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.output_path = Path(self.temp_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _create_dummy_image(self, width: int, height: int, pattern: str = "rect") -> Image.Image:
        img = Image.new("RGB", (width, height), color=(30, 30, 30))
        draw = ImageDraw.Draw(img)
        if pattern == "rect":
            draw.rectangle([10, 10, width // 2, height // 2], fill=(255, 255, 255))
        elif pattern == "circle":
            draw.ellipse([width // 4, height // 4, 3 * width // 4, 3 * height // 4], fill=(255, 255, 0))
        elif pattern == "diag":
            draw.line([0, 0, width, height], fill=(0, 255, 255), width=20)
        return img

    def test_treatment_filtering(self):
        self.assertTrue(is_excluded_treatment("Porsche 911 GT3 RS Full Body Gloss PPF"))
        self.assertTrue(is_excluded_treatment("BMW M4 G82 Stage 1 Polish + Ceramic Coating"))
        self.assertTrue(is_excluded_treatment("Mercedes AMG Clear Bra Protection"))
        self.assertFalse(is_excluded_treatment("BMW M3 F80 Full Color Change Wrap"))
        self.assertFalse(is_excluded_treatment("Widebody Kit and Wheel Transformation"))

    def test_full_shot_preference(self):
        wide_car_img = self._create_dummy_image(1920, 1080, pattern="rect")
        crop_img = self._create_dummy_image(400, 400, pattern="circle")

        score_wide, _ = is_likely_full_shot(wide_car_img, "BMW M3 Front 3/4 Main Exterior")
        score_crop, _ = is_likely_full_shot(crop_img, "Brake caliper close-up macro")

        self.assertGreater(score_wide, score_crop)

    def test_image_validation(self):
        small_img = self._create_dummy_image(200, 200)
        self.assertFalse(validate_image_dimensions(small_img, min_width=380, min_height=280))

        valid_img = self._create_dummy_image(800, 600)
        self.assertTrue(validate_image_dimensions(valid_img, min_width=380, min_height=280))

    def test_side_by_side_split(self):
        collage = self._create_dummy_image(1200, 600, pattern="rect")
        self.assertTrue(is_side_by_side_collage(collage))

        b, a = split_horizontal_collage(collage)
        self.assertEqual(b.size, (600, 600))
        self.assertEqual(a.size, (600, 600))

    def test_dedup_detection(self):
        index = PerceptualDedupIndex()
        img1 = self._create_dummy_image(500, 500, pattern="rect")
        # Exact copy should be flagged
        is_dup, reason = index.is_invalid_or_duplicate(img1, img1)
        self.assertTrue(is_dup)
        self.assertIn("identical", reason.lower())

        img2 = self._create_dummy_image(500, 500, pattern="circle")
        is_dup, _ = index.is_invalid_or_duplicate(img1, img2)
        self.assertFalse(is_dup)

    def test_storage_and_review_generation(self):
        storage = DatasetStorage(output_dir=self.output_path)
        img_b = self._create_dummy_image(600, 400, pattern="rect")
        img_a = self._create_dummy_image(600, 400, pattern="diag")

        pair_id, meta = storage.save_pair(
            img_before=img_b,
            img_after=img_a,
            title="Custom Widebody Kit on S2000 (Before/After)",
            source_url="https://example.com/s2000",
            source_type="test",
            author="tester",
            subreddit="JDM",
            extra_info={
                "vision_validation": {
                    "passed": True,
                    "reason": "Clear vehicle before and after with distinct modification.",
                }
            }
        )

        self.assertEqual(pair_id, "0001")
        self.assertTrue((self.output_path / "0001_before.jpg").exists())
        self.assertTrue((self.output_path / "0001_after.jpg").exists())
        self.assertTrue((self.output_path / "metadata.json").exists())

        review_file = generate_review_html(storage=storage, output_path=self.output_path / "review.html")
        self.assertTrue(review_file.exists())
        content = review_file.read_text(encoding="utf-8")
        self.assertIn("0001", content)
        self.assertIn("S2000", content)
        self.assertIn("Vision: PASS", content)

    def test_vision_validator_initialization(self):
        validator = VisionPairValidator()
        self.assertIsNotNone(validator.model)


if __name__ == "__main__":
    unittest.main()
