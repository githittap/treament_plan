"""SMS XML을 읽기 전용으로 순회하고 원문을 파일에 남기지 않고 공통 JS 파서로 넘김."""
import argparse,json,subprocess,sys
from pathlib import Path
import xml.etree.ElementTree as ET
from datetime import datetime,timezone

def records(source):
    for _,el in ET.iterparse(source,events=('end',)):
        if el.tag=='sms':
            yield el.get('body',''),int(el.get('date','0')), 'sms'
            el.clear()
        elif el.tag=='mms':
            ms=int(el.get('date','0'))
            if ms and ms<100000000000: ms*=1000
            text='\n'.join(p.get('text','') for p in el.iter('part') if p.get('ct')=='text/plain')
            yield text,ms,'mms'
            el.clear()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--source',required=True)
    ap.add_argument('--out',required=True)
    args=ap.parse_args()
    node=Path(__file__).with_suffix('.mjs')
    process=subprocess.Popen(['node',str(node),'--out',args.out],stdin=subprocess.PIPE,text=True,encoding='utf-8')
    try:
        for body,ms,kind in records(args.source):
            if not body: continue
            at=datetime.fromtimestamp(ms/1000,timezone.utc).isoformat() if ms>100000000000 else None
            process.stdin.write(json.dumps({'text':body,'received_at':at,'source_kind':kind},ensure_ascii=True)+'\n')
        process.stdin.close()
        status=process.wait()
    except BaseException:
        try: process.stdin.close()
        except (OSError,BrokenPipeError): pass
        process.wait()
        raise
    if status: raise SystemExit(status)
if __name__=='__main__':main()