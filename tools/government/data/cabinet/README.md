# Past heads of the executive departments

Used by the "Show a president" picker on /government/executive/. Rebuild with:

    python3 tools/government/build_cabinet.py
    python3 tools/government/build_executive.py ../congress-legislators

- `official/` holds each department's own list as read on November 7, 2026 (first line of each file names the page), plus Wikipedia officeholder tables used where the department's list has no dates.
- `chamberlain-appointments.csv` is Tait Chamberlain, *United States of America Cabinet Appointments Dataset* (2020), https://github.com/taitcha/American_cabinet_appointments, CC BY 3.0 US. Used only as a check.
- `heads.json` is the built result. `check.txt` lists every place the sources disagree and which one is shown.
