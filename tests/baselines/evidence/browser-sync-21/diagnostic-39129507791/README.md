# Closed test-synchronization issue #21

[CI39129507791 attempt1](https://github.com/evangelistalab/vibemol/actions/runs/39129507791) invalidated the old fixed-sleep expectation. All nine original assertions used the same comparison, harness and CI runner; a fresh browser was used each time.

| Source | First scroll/client | Second | Third |
| --- | --- | --- | --- |
| Tagged1c609b3 |304/304|304/304|304/304|
| Integration63082fe |442/12|442/12|304/304|
| Held5c8d75a4f |304/304|304/304|442/12|

At all failing reads, compact=false retained the desktop bar at x300/width20. All passing reads had compact=true, bar x0/width320. The failing pages subsequently leave the transient. The human therefore closed#21 as a harness synchronization defect and restored the34/3/37 exact three-workflow gate. No production layout behavior is changed. `edit_tool.py` waits for compact=true at320px, crosses the existing presented-frame boundary and retains its overflow comparison, one-pixel tolerance and comparand logging. The separate question of a perceptible frame is nonblocking.

The original diagnostic/failed gate reports are preserved. This compact readback record is validation evidence for the harness correction; it is not a merge gate. The separately declined271-file evidence branch remains local.
