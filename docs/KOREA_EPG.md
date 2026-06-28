# Korea NAVER EPG

StreamShogun builds the Master-profile Korea guide with GitHub Actions and `epg2xml`.

- Provider: `NAVER`
- Channel selection: all NAVER service channels via `MY_CHANNELS: "*"`
- Schedule: every 12 hours, plus manual `workflow_dispatch`
- Output branch: `epg-output`
- XMLTV URL:

```text
https://raw.githubusercontent.com/ColinGamez/StreamShogun/epg-output/epg/korea-naver.xml.gz
```

Render uses that URL as `MASTER_KOREA_EPG_URL`. The desktop app still loads it through the authenticated Master bridge, so it only appears inside Colin's Master profile.
