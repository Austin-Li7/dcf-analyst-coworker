from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).resolve().parents[1]
PROMPT_DIR = ROOT / "v5.5_DCF"
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"


@dataclass
class AnnualFact:
    fiscal_year: int
    revenue_usd_m: float | None
    operating_income_usd_m: float | None
    operating_cash_flow_usd_m: float | None
    capex_usd_m: float | None
    free_cash_flow_usd_m: float | None
    cash_and_marketable_securities_usd_m: float | None
    total_debt_usd_m: float | None
    common_shares_outstanding_m: float | None


REVENUE_CONCEPTS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
]
OPERATING_INCOME_CONCEPTS = ["OperatingIncomeLoss"]
OPERATING_CASH_FLOW_CONCEPTS = ["NetCashProvidedByUsedInOperatingActivities"]
CAPEX_CONCEPTS = ["PaymentsToAcquirePropertyPlantAndEquipment"]
CASH_CONCEPTS = [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
]
DEBT_CURRENT_CONCEPTS = ["ShortTermBorrowings", "ShortTermDebtCurrent"]
DEBT_NONCURRENT_CONCEPTS = [
    "LongTermDebtNoncurrent",
    "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
]
SHARES_CONCEPTS = ["EntityCommonStockSharesOutstanding"]


def sec_user_agent() -> str:
    secret_user_agent = None
    try:
        secret_user_agent = st.secrets.get("SEC_USER_AGENT", None)
    except Exception:
        secret_user_agent = None

    return (
        secret_user_agent
        or os.environ.get("SEC_USER_AGENT")
        or "AI DCF Workflow Streamlit Demo; set SEC_USER_AGENT for production use"
    )


def fetch_json(url: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": sec_user_agent(), "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"SEC request failed with HTTP {exc.code}: {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach SEC endpoint: {exc.reason}") from exc


@st.cache_data(ttl=24 * 60 * 60)
def fetch_ticker_index() -> dict[str, Any]:
    return fetch_json(SEC_TICKERS_URL)


@st.cache_data(ttl=12 * 60 * 60)
def fetch_company_facts(cik: str) -> dict[str, Any]:
    return fetch_json(SEC_FACTS_URL.format(cik=cik))


def pad_cik(cik: int | str) -> str:
    return str(cik).zfill(10)


def usd_millions(value: float | None) -> float | None:
    return None if value is None else round(value / 1_000_000, 1)


def shares_millions(value: float | None) -> float | None:
    return None if value is None else round(value / 1_000_000, 1)


def annual_rows(fact: dict[str, Any] | None, unit: str = "USD") -> list[dict[str, Any]]:
    rows = (fact or {}).get("units", {}).get(unit, [])
    annual = [
        row
        for row in rows
        if row.get("form") in {"10-K", "10-K/A"}
        and (row.get("fp") == "FY" or str(row.get("frame", "")).startswith("CY"))
        and isinstance(row.get("fy"), int)
        and isinstance(row.get("val"), (int, float))
    ]
    return sorted(annual, key=lambda row: str(row.get("filed", "")))


def latest_annual_value(
    facts: dict[str, Any],
    concepts: list[str],
    fiscal_year: int,
    unit: str = "USD",
) -> float | None:
    us_gaap = facts.get("facts", {}).get("us-gaap", {})
    dei = facts.get("facts", {}).get("dei", {})
    all_facts = {**us_gaap, **dei}

    for concept in concepts:
        rows = [row for row in annual_rows(all_facts.get(concept), unit) if row.get("fy") == fiscal_year]
        if rows:
            return float(rows[-1]["val"])

    return None


def fiscal_years_from_revenue(facts: dict[str, Any]) -> list[int]:
    us_gaap = facts.get("facts", {}).get("us-gaap", {})
    years: set[int] = set()
    for concept in REVENUE_CONCEPTS:
        for row in annual_rows(us_gaap.get(concept)):
            years.add(int(row["fy"]))
    return sorted(years)[-5:]


def build_bootstrap_package(ticker: str) -> dict[str, Any]:
    ticker_index = fetch_ticker_index()
    match = next(
        (
            entry
            for entry in ticker_index.values()
            if str(entry.get("ticker", "")).upper() == ticker.upper()
        ),
        None,
    )
    if not match:
        raise ValueError(f"No SEC ticker mapping found for {ticker.upper()}.")

    cik = pad_cik(match["cik_str"])
    facts = fetch_company_facts(cik)
    years = fiscal_years_from_revenue(facts)
    drivers: list[AnnualFact] = []

    for year in years:
        revenue = latest_annual_value(facts, REVENUE_CONCEPTS, year)
        operating_income = latest_annual_value(facts, OPERATING_INCOME_CONCEPTS, year)
        operating_cash_flow = latest_annual_value(facts, OPERATING_CASH_FLOW_CONCEPTS, year)
        capex = latest_annual_value(facts, CAPEX_CONCEPTS, year)
        cash = latest_annual_value(facts, CASH_CONCEPTS, year)
        current_debt = latest_annual_value(facts, DEBT_CURRENT_CONCEPTS, year)
        noncurrent_debt = latest_annual_value(facts, DEBT_NONCURRENT_CONCEPTS, year)
        shares = latest_annual_value(facts, SHARES_CONCEPTS, year, "shares")
        total_debt = (
            None
            if current_debt is None and noncurrent_debt is None
            else (current_debt or 0) + (noncurrent_debt or 0)
        )

        drivers.append(
            AnnualFact(
                fiscal_year=year,
                revenue_usd_m=usd_millions(revenue),
                operating_income_usd_m=usd_millions(operating_income),
                operating_cash_flow_usd_m=usd_millions(operating_cash_flow),
                capex_usd_m=usd_millions(capex),
                free_cash_flow_usd_m=(
                    None
                    if operating_cash_flow is None or capex is None
                    else usd_millions(operating_cash_flow - capex)
                ),
                cash_and_marketable_securities_usd_m=usd_millions(cash),
                total_debt_usd_m=usd_millions(total_debt),
                common_shares_outstanding_m=shares_millions(shares),
            )
        )

    source_url = SEC_FACTS_URL.format(cik=cik)
    base_year = asdict(drivers[-1]) if drivers else None
    return {
        "schema_version": "sec_bootstrap_v1",
        "company": {
            "name": match["title"],
            "ticker": ticker.upper(),
            "cik": cik,
        },
        "source_manifest": [
            {
                "source_id": "source:sec:companyfacts",
                "source_type": "sec_companyfacts",
                "name": "SEC Company Facts API",
                "locator": source_url,
            }
        ],
        "historical_annual_dcf_drivers": [asdict(row) for row in drivers],
        "historical_quarterly_baseline": {
            "rows": [
                {
                    "fiscal_year": row.fiscal_year,
                    "quarter": "Q4",
                    "segment": "Total Company",
                    "product_category": "Total Company",
                    "product_name": "Total Company",
                    "revenue_usd_m": row.revenue_usd_m,
                    "operating_income_usd_m": row.operating_income_usd_m,
                    "source_name": "SEC Company Facts API",
                    "source_url": source_url,
                    "review_note": "Annual SEC Company Facts value represented as Q4 Total Company baseline for review.",
                }
                for row in drivers
            ]
        },
        "normalized_base_year": base_year,
        "minimum_dcf_readiness_checklist": {
            "has_revenue": any(row.revenue_usd_m is not None for row in drivers),
            "has_operating_income": any(row.operating_income_usd_m is not None for row in drivers),
            "has_cash_flow_or_fcf": any(row.free_cash_flow_usd_m is not None for row in drivers),
            "has_balance_sheet_bridge": bool(
                base_year
                and (
                    base_year.get("cash_and_marketable_securities_usd_m")
                    or base_year.get("total_debt_usd_m")
                )
            ),
        },
    }


def render_prompt_browser() -> None:
    prompt_files = sorted(PROMPT_DIR.glob("*.md"))
    selected = st.selectbox("Prompt file", prompt_files, format_func=lambda path: path.name)
    st.markdown(selected.read_text(encoding="utf-8"))


def render_next_embed() -> None:
    st.caption("Start the Next.js app separately with `cd dcf-cfp-module && npm run dev`.")
    next_url = st.text_input("Next app URL", value="http://localhost:3000")
    height = st.slider("Embed height", min_value=500, max_value=1200, value=850, step=50)
    components.iframe(next_url, height=height, scrolling=True)


def render_bootstrap() -> None:
    ticker = st.text_input("Ticker", value="AAPL", max_chars=12).strip().upper()
    run = st.button("Fetch SEC Bootstrap Package", type="primary")

    if run and ticker:
        with st.spinner(f"Fetching SEC Company Facts for {ticker}..."):
            package = build_bootstrap_package(ticker)

        company = package["company"]
        drivers = package["historical_annual_dcf_drivers"]
        base_year = package["normalized_base_year"] or {}

        st.success(f"Loaded {company['name']} ({company['ticker']}) from SEC CIK {company['cik']}.")

        cols = st.columns(4)
        cols[0].metric("Years", len(drivers))
        cols[1].metric("Base FY", base_year.get("fiscal_year", "n/a"))
        cols[2].metric("Revenue USD m", base_year.get("revenue_usd_m", "n/a"))
        cols[3].metric("FCF USD m", base_year.get("free_cash_flow_usd_m", "n/a"))

        st.dataframe(drivers, use_container_width=True)
        st.download_button(
            "Download bootstrap JSON",
            data=json.dumps(package, indent=2),
            file_name=f"{ticker.lower()}-sec-bootstrap.json",
            mime="application/json",
        )

        with st.expander("Raw package JSON"):
            st.json(package)


def main() -> None:
    st.set_page_config(page_title="AI DCF Workflow Lab", layout="wide")
    st.title("AI DCF Workflow Lab")
    st.caption("Streamlit shell for quick SEC data bootstrap tests and portfolio demos.")

    page = st.sidebar.radio(
        "View",
        ["SEC Bootstrap", "Prompt Browser", "Embed Next App", "About"],
    )

    if page == "SEC Bootstrap":
        render_bootstrap()
    elif page == "Prompt Browser":
        render_prompt_browser()
    elif page == "Embed Next App":
        render_next_embed()
    else:
        st.markdown(
            """
            This Streamlit layer is a lightweight testing shell around the DCF workflow project.

            - Use **SEC Bootstrap** to fetch public Company Facts without preparing local files.
            - Use **Prompt Browser** to review the v5.5 workflow prompt set.
            - Use **Embed Next App** when the original interactive Next.js app is running locally or deployed.

            The full UI is still the Next.js app. Streamlit is intentionally used here as a faster
            experiment surface for data bootstrap and demo workflows.
            """
        )


if __name__ == "__main__":
    main()
