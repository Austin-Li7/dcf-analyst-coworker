# Streamlit Demo Shell

This folder adds a lightweight Streamlit layer around the DCF workflow project.

## What It Does

- fetches public SEC Company Facts from a ticker
- builds a downloadable DCF bootstrap JSON package
- browses the v5.5 prompt files
- optionally embeds the Next.js app when it is running locally or deployed

## Run

```bash
cd streamlit_app
python3 -m pip install -r requirements.txt
streamlit run app.py
```

For SEC requests, set a clear user agent:

```bash
export SEC_USER_AGENT="Your Name your.email@example.com"
```

## Streamlit Cloud

Set `SEC_USER_AGENT` in Streamlit secrets. If the Next app is deployed separately, paste its URL into the **Embed Next App** page.
