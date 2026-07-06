#!/usr/bin/env bash
cd fb_dashboard && exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
