#!/usr/bin/env python3

import json

out = {"independent": [], "sites": {}}

with open("../res/list.txt", "r") as im:
    lines = im.readlines()
    for line in lines:
        line = line[:-1]
        if line.startswith("! SCRIPT BLOCKING"):
            break
        if line[0] in ['!', '[', '@', '|', '/'] or "##" not in line:
            continue
        sites, css = line.split("##", 1)
        if sites == "":
            for selector in css.split(","):
                out["independent"].append(selector)
        else:
            for site in sites.split(","):
                site = site.replace("~", "")
                if site not in out["sites"]:
                    out["sites"][site] = []
                for selector in css.split(","):
                    out["sites"][site].append(selector)

with open("../res/list.json", "w") as outfile:
    json.dump(out, outfile, indent=2)
