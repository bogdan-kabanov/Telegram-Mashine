#!/usr/bin/env python3
import os, urllib.request
from pathlib import Path
import paramiko

# fetch HTML snippet with img src from admin projects
url = "https://80-78-248-96.sslip.io/admin/projects"
html = urllib.request.urlopen(url, timeout=30).read().decode("utf-8", errors="replace")
# find renders urls
import re
srcs = re.findall(r'src=\\"([^\\"]*renders[^\\"]*)\\"', html)
srcs2 = re.findall(r'src="([^"]*renders[^"]*)"', html)
print("escaped srcs", srcs[:10])
print("plain srcs", srcs2[:10])
# also look for /app/public
print("has /app/public", "/app/public" in html)
print("has /renders/", "/renders/" in html)

# download one image and check magic
req = urllib.request.urlopen("https://80-78-248-96.sslip.io/renders/c1919968-3ff1-4fa8-a593-4b0bbf1902ed_screen_1.png", timeout=30)
data = req.read(32)
print("headers", dict(req.headers))
print("magic", data[:8])
