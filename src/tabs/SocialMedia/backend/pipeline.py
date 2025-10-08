import os
import shutil
from contextlib import contextmanager
from typing import List

import numpy as np
import torch
from moviepy.editor import VideoFileClip, ImageClip, concatenate_videoclips
from PIL import Image
import cv2
import clip  # pip install git+https://github.com/openai/CLIP.git

# ---------- Video settings ----------
INSTAGRAM_WIDTH = 1080
INSTAGRAM_HEIGHT = 1920
MAX_FRAMES_PER_VIDEO = 5
MIN_CLIP_DURATION = 0.5  # seconds

# ---------- CLIP model (singleton) ----------
_device = "cuda" if torch.cuda.is_available() else "cpu"
_model, _preprocess = clip.load("ViT-B/32", device=_device)

# ---------- utils ----------
@contextmanager
def TmpDir(root: str):
    import time
    p = os.path.join(root, f"job_{os.getpid()}_{int(time.time()*1000)}_{np.random.randint(1e9)}")
    os.makedirs(p, exist_ok=True)
    try:
        yield p
    finally:
        shutil.rmtree(p, ignore_errors=True)

def _image_embedding_from_frame(frame: np.ndarray) -> torch.Tensor:
    if frame.dtype != np.uint8:
        frame = np.clip(frame, 0, 255).astype(np.uint8)
    if frame.ndim == 3 and frame.shape[-1] == 3:
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(frame)
    image_input = _preprocess(pil_image).unsqueeze(0).to(_device)
    with torch.no_grad():
        return _model.encode_image(image_input).squeeze(0)

def _video_embedding(path: str, n_frames: int = MAX_FRAMES_PER_VIDEO):
    try:
        clip_obj = VideoFileClip(path)
        if clip_obj.duration < MIN_CLIP_DURATION:
            return None
        times = [clip_obj.duration * i / (n_frames + 1) for i in range(1, n_frames + 1)]
        embs = []
        for t in times:
            frame = clip_obj.get_frame(t)  # RGB float [0,1]
            if frame.dtype != np.uint8:
                frame = np.clip(frame * 255.0, 0, 255).astype(np.uint8)
            embs.append(_image_embedding_from_frame(frame))
        clip_obj.close()
        return torch.mean(torch.stack(embs), dim=0)
    except Exception:
        return None

def _resize_crop_9x16_video(v: VideoFileClip) -> VideoFileClip:
    v = v.resize(height=INSTAGRAM_HEIGHT)
    x_center = v.w // 2
    if v.w >= INSTAGRAM_WIDTH:
        v = v.crop(x_center=x_center, width=INSTAGRAM_WIDTH)
    return v

def _resize_crop_9x16_image(path: str) -> ImageClip:
    img = ImageClip(path).set_duration(3)
    img = img.resize(height=INSTAGRAM_HEIGHT)
    x_center = img.w // 2
    if img.w >= INSTAGRAM_WIDTH:
        img = img.crop(x_center=x_center, width=INSTAGRAM_WIDTH)
    return img

def build_montage_for_paths(local_paths: List[str]) -> str:
    """
    Build a 9:16 montage from local video/image paths.
    Videos are ordered by CLIP similarity; images appended after.
    Returns local path to the MP4.
    """
    video_exts = (".mp4", ".mov", ".m4v", ".avi", ".mkv")
    image_exts = (".jpg", ".jpeg", ".png", ".webp")

    videos = [p for p in local_paths if p.lower().endswith(video_exts)]
    images = [p for p in local_paths if p.lower().endswith(image_exts)]

    # Greedy similarity ordering for videos
    ordered_videos = []
    remaining = []
    for v in videos:
        emb = _video_embedding(v)
        if emb is not None:
            remaining.append({"path": v, "emb": emb})

    if remaining:
        current = remaining.pop(0)
        ordered_videos.append(current)
        while remaining:
            sims = [torch.cosine_similarity(current["emb"], r["emb"], dim=0) for r in remaining]
            import torch as _torch
            next_idx = int(_torch.argmax(_torch.stack(sims)))
            current = remaining.pop(next_idx)
            ordered_videos.append(current)

    # Compose clips
    final_clips = []
    for v in ordered_videos:
        vc = VideoFileClip(v["path"])
        final_clips.append(_resize_crop_9x16_video(vc))
    for im in images:
        final_clips.append(_resize_crop_9x16_image(im))

    if not final_clips:
        raise RuntimeError("No usable video or image clips found to compose.")

    out_dir = os.path.dirname(local_paths[0]) if local_paths else "/tmp"
    out_path = os.path.join(out_dir, "montage_output.mp4")
    final = concatenate_videoclips(final_clips, method="compose")
    final.write_videofile(out_path, fps=30)

    try:
        final.close()
    except Exception:
        pass
    for c in final_clips:
        try:
            c.close()
        except Exception:
            pass

    return out_path
