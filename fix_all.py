import re
import sys
import os

def fix_dateUtils():
    path = 'packages/core/src/dateUtils.ts'
    with open(path, 'r') as f:
        content = f.read()
    # Fix negative offset bug (Req 5)
    # cleanStr = naiveIsoString.split('+')[0].split('Z')[0];
    # We want to replace it to properly strip time zone offsets, e.g. -05:00
    # naiveIsoString could be "2026-05-20T14:30:00-05:00"
    content = content.replace(
        "const cleanStr = naiveIsoString.split('+')[0].split('Z')[0];",
        """// Strip any existing offset or 'Z' suffix to treat as naive local time
  const [datePart, timePartRaw] = naiveIsoString.split('T');
  const timePart = timePartRaw ? timePartRaw.split('+')[0].split('-')[0].split('Z')[0] : '';
  const cleanStr = timePart ? `${datePart}T${timePart}` : datePart;"""
    )
    with open(path, 'w') as f:
        f.write(content)

def fix_mta():
    path = 'packages/core/src/mta.ts'
    with open(path, 'r') as f:
        content = f.read()
    # Fix Req 3: exact matching for mta route
    content = content.replace(
        "if (entity.alert?.informed_entity?.some(ie => ie.route_id && ie.route_id.includes(r))) {",
        "if (entity.alert?.informed_entity?.some(ie => ie.route_id && (ie.route_id === r || ie.route_id.endsWith(`:${r}`)))) {"
    )
    with open(path, 'w') as f:
        f.write(content)

def fix_cta():
    path = 'packages/core/src/cta.ts'
    with open(path, 'r') as f:
        content = f.read()
    # Remove getLiveTrainArrivals (Req 1)
    # It starts with export const getLiveTrainArrivals and ends after the function block
    content = re.sub(r'export const getLiveTrainArrivals.*?^};\s*', '', content, flags=re.MULTILINE | re.DOTALL)
    with open(path, 'w') as f:
        f.write(content)

def fix_notify_and_trip():
    # Since resolving the notify merge conflict is complex, I will just checkout HEAD for notify and trip, and then re-apply the changes if necessary.
    pass

fix_dateUtils()
fix_mta()
fix_cta()
print("Fixed small bugs")
