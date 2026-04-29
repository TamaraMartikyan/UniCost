#!/usr/bin/env python3
"""
Run this ONCE before building the installer to download the ODBC driver.
It will be bundled inside the installer so users don't need internet.

Usage:
    python download_redist.py
"""
import urllib.request, os, sys

os.makedirs('redist', exist_ok=True)

url = 'https://go.microsoft.com/fwlink/?linkid=2217459'  # msodbcsql17 x64
dest = 'redist/msodbcsql17.msi'

if os.path.exists(dest):
    print(f"Already downloaded: {dest}")
    sys.exit(0)

print("Downloading ODBC Driver 17 for SQL Server (~10MB)...")
print(f"URL: {url}")

def progress(count, block_size, total_size):
    if total_size > 0:
        pct = min(100, count * block_size * 100 // total_size)
        print(f"\r  {pct}%", end='', flush=True)

urllib.request.urlretrieve(url, dest, reporthook=progress)
print(f"\nSaved to: {dest}")
print("Now run: npm run build:win")
