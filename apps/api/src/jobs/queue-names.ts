// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.3 -- named queues in
// one place so a new consumer doesn't have to hunt for the string ID a
// producer used elsewhere.
export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';
