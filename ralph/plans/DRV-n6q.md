# Bid scoring and resolution

Task: DRV-n6q

## Steps

1. Review existing bid/bid window/assignment services and data access to place `resolveBidWindow` and confirm available fields for scoring.
2. Implement score calculation per spec, including route familiarity normalization and route preference bonus.
3. Fetch pending bids for the window, compute scores, sort by score desc then bidAt asc, and handle the no-bids edge case.
4. Persist resolution updates for winner/losers, assignment ownership, and bid window status/winnerId.
5. Send bid_won and bid_lost notifications with route/date details.

## Acceptance Criteria

- Scores calculated correctly per formula
- Highest score wins
- Ties broken by earliest bid timestamp
- Winner's bid marked 'won', others marked 'lost'
- Assignment updated with winner's userId
- Assignment.assignedBy set to 'bid'
- Winner receives push notification "You won [Route] for [Date]"
- Losers receive push notification "[Route] assigned to another driver"
- BidWindow status set to 'resolved', winnerId set
