#!/usr/bin/env python3
from PIL import Image

img = Image.open("resources/app-icon-1024.png")
# Create 256x256 version for Windows
img_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
img_256.save("resources/icon-256.png", "PNG")
print("Created 256x256 PNG icon for Windows")

