/**
 * Plan feature-flag hook — check if current plan allows a feature.
 * Usage: const { can } = usePlan(user)
 *        can("has_dm") → true/false
 *        can("max_replies", current_usage) → true if under limit
 */
export function usePlan(user) {
  if (!user || !user.plan) return { plan: null, can: () => false, planName: "" }

  const plan = user.plan // object from /api/me with plan fields
  const planName = user.plan_name || ""

  function can(feature, currentValue) {
    if (!plan) return false
    if (typeof plan[feature] === "boolean") return plan[feature]
    if (typeof plan[feature] === "number" && currentValue !== undefined)
      return currentValue < plan[feature]
    // Default: if plan has a "basic" or "premium" level, check it
    return false
  }

  function max(feature) {
    if (!plan) return 0
    return plan[feature] || 0
  }

  return { plan, can, max, planName }
}
