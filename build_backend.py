#!/usr/bin/env python3
"""
Run this script to build the backend executable with PyInstaller.
Place the output in the 'backend' folder next to this script.

Usage:
    cd C:\\Users\\Admin\\PycharmProjects\\UniCost
    python build_backend.py
"""
import subprocess, sys, os, shutil

print("Building backend executable with PyInstaller...")

cmd = [
    sys.executable, "-m", "PyInstaller",
    "--onefile",
    "--name", "main",
    "--distpath", "backend",
    "--workpath", "build_temp",
    "--specpath", "build_temp",
    "--hidden-import", "uvicorn.logging",
    "--hidden-import", "uvicorn.loops",
    "--hidden-import", "uvicorn.loops.auto",
    "--hidden-import", "uvicorn.protocols",
    "--hidden-import", "uvicorn.protocols.http",
    "--hidden-import", "uvicorn.protocols.http.auto",
    "--hidden-import", "uvicorn.protocols.websockets",
    "--hidden-import", "uvicorn.protocols.websockets.auto",
    "--hidden-import", "uvicorn.lifespan",
    "--hidden-import", "uvicorn.lifespan.on",
    "--hidden-import", "fastapi",
    "--hidden-import", "pyodbc",
    "--hidden-import", "openpyxl",
    "--hidden-import", "openpyxl.styles",
    "--hidden-import", "openpyxl.utils",
    "--hidden-import", "email.mime.multipart",
    "--collect-all", "uvicorn",
    "main.py"
]

result = subprocess.run(cmd)

if result.returncode == 0:
    print("\n✅ Backend built successfully!")
    print("   Output: backend/main.exe (Windows) or backend/main (Mac/Linux)")
    # Clean up build temp
    if os.path.exists("build_temp"):
        shutil.rmtree("build_temp")
else:
    print("\n❌ Build failed. Check output above.")
    sys.exit(1)
