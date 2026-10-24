"""S6: fiscal-calendar variants a reusable product meets across clients.

Variants: calendar year (SAP K4-like, 12 periods + special periods), shifted year April-March
(SAP V3-like, year shift), 4-4-5 week calendar ending on the Saturday nearest 31 December
(52/53 weeks), and a shortened transition year when a client changes its year end.
"""
from __future__ import annotations

import datetime as dt
import json
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from alloc import r_hamilton_key_signed  # noqa: E402


def sat_nearest(d: dt.date) -> dt.date:
    shift = (5 - d.weekday()) % 7          # days forward to Saturday
    fwd = d + dt.timedelta(days=shift)
    back = fwd - dt.timedelta(days=7)
    return fwd if (fwd - d) <= (d - back) else back


def fy445(year: int):
    """Periods (start, end) of fiscal year `year` in a 4-4-5 calendar ending on the Saturday nearest 31 Dec."""
    end = sat_nearest(dt.date(year, 12, 31))
    start = sat_nearest(dt.date(year - 1, 12, 31)) + dt.timedelta(days=1)
    weeks = (end - start).days // 7 + 1
    pattern = [4, 4, 5] * 4
    if weeks == 53:
        pattern[-1] += 1                   # common convention: extra week in the last period
    periods, cur = [], start
    for w in pattern:
        nxt = cur + dt.timedelta(weeks=w)
        periods.append((cur, nxt - dt.timedelta(days=1)))
        cur = nxt
    assert periods[-1][1] == end, (year, periods[-1][1], end)
    return periods


def _valid(y, m, d):
    try:
        dt.date(y, m, d)
        return True
    except ValueError:
        return False


def run():
    out = {}
    years = range(2020, 2046)
    long_years = [y for y in years if (fy445(y)[-1][1] - fy445(y)[0][0]).days + 1 == 371]
    out["445_53_week_years_2020_2045"] = long_years

    y53 = long_years[0]
    p12_53 = (fy445(y53)[-1][1] - fy445(y53)[-1][0]).days + 1
    p12_52 = (fy445(y53 - 1)[-1][1] - fy445(y53 - 1)[-1][0]).days + 1
    out["445_P12_yoy_artifact_pct"] = round(100 * (p12_53 / p12_52 - 1), 1)
    out["445_full_year_yoy_artifact_pct"] = round(100 * (371 / 364 - 1), 2)

    # equal-per-period spread vs day-weighted spread in a 52-week 4-4-5 year
    per = fy445(2026)
    days = [(e - s).days + 1 for s, e in per]
    annual = 12_000_000_00
    equal = r_hamilton_key_signed(annual, [1] * 12, list(range(12)))
    by_day = r_hamilton_key_signed(annual, days, list(range(12)))
    out["445_equal_vs_daily_spread_max_gap_pct_of_period"] = round(
        100 * max(abs(a - b) / b for a, b in zip(equal, by_day)), 1)
    out["445_spread_conserves"] = dict(equal=sum(equal) == annual, by_day=sum(by_day) == annual)

    # calendar-month actuals mapped into 4-4-5 periods by day proration: conservation check
    month_actuals = {m: 1_000_000 + 37 * m for m in range(1, 13)}   # cents, synthetic
    fy = fy445(2026)
    period_totals = [0] * 12
    for m, amt in month_actuals.items():
        first = dt.date(2026, m, 1)
        last = (dt.date(2026 + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1))
        overlaps = []
        for i, (s, e) in enumerate(fy):
            o = (min(e, last) - max(s, first)).days + 1
            if o > 0:
                overlaps.append((i, o))
        # days of the month that fall outside this fiscal year belong to the neighbouring year
        inside = sum(o for _, o in overlaps)
        month_days = (last - first).days + 1
        share_inside = r_hamilton_key_signed(amt, [inside, month_days - inside], [0, 1])[0] if inside < month_days else amt
        parts = r_hamilton_key_signed(share_inside, [o for _, o in overlaps], [i for i, _ in overlaps])
        for (i, _), p in zip(overlaps, parts):
            period_totals[i] += p
    out["calendar_month_to_445_mapping"] = dict(
        months_spanning_two_or_more_periods=sum(
            1 for m in range(1, 13)
            if len({i for i, (s, e) in enumerate(fy)
                    for day in range(1, 32) if _valid(2026, m, day) and s <= dt.date(2026, m, day) <= e}) > 1),
        fiscal_2026_starts=str(fy[0][0]), fiscal_2026_ends=str(fy[-1][1]),
        amount_crossing_into_other_fiscal_years_cents=sum(month_actuals.values()) - sum(period_totals))

    # April-March year: which fiscal-year label does a month get under the two common conventions?
    def label_start_year(d):
        return d.year if d.month >= 4 else d.year - 1

    def label_end_year(d):
        return d.year + 1 if d.month >= 4 else d.year

    mism = sum(1 for m in range(1, 13) if label_start_year(dt.date(2026, m, 1)) != label_end_year(dt.date(2026, m, 1)))
    out["april_march_label_conventions_months_differ"] = mism

    # shortened transition year: client moves year end from December to March
    transition_periods = 3                  # Jan-Mar of the change year
    horizon_naive = "FY+1 = 12 periods ahead"
    out["shortened_year"] = dict(transition_periods=transition_periods,
                                 naive_horizon_rule=horizon_naive,
                                 naive_rule_misaligns_by_periods=12 - transition_periods)
    return out


if __name__ == "__main__":
    print(json.dumps(run(), indent=1))
