// Value-to-label maps extracted from the admin "Add Property" form
// (`api-spec/add-property-page-form.html`). Only fields the API actually
// returns are mapped here — fields the API resolves via sister keys
// (e.g., propertySubType → SUB_PROPERTY_TYPE) are skipped.

export const LOOKUPS = {
  propertyType: {
    "0": "Residential",
    "1": "Commercial",
    "2": "Land",
    "3": "Bank Owned",
    "4": "Luxurious",
    "5": "Foreclosed",
    "6": "Moveable Asset",
  },

  status: {
    "0": "Inactive",
    "1": "Active",
  },

  verifyStatus: {
    "0": "Not Verified",
    "1": "Verified",
  },

  propertyLabel: {
    "1": "Under construction",
    "2": "Delivered",
    "3": "Off plan",
    "4": "Foreclosure",
    "5": "Distressed",
  },

  propertyOccupancyStatus: {
    vacant: "Vacant",
    occupied: "Occupied",
  },

  purchaseStatus: {
    "31": "Finance available",
    "32": "Cash only",
    "43": "Cash payment & Installments",
  },

  sellerType: {
    "1": "Individual",
    "2": "Developer",
    "3": "Institution",
  },

  featured: {
    "0": "No",
    "1": "Featured",
    "2": "VIP Featured",
  },

  tenure: {
    "1": "Freehold",
    "2": "Leasehold",
    "3": "Share of freehold",
    "4": "Feudal",
  },

  land_use: {
    "1": "Agricultural",
    "2": "Commercial",
    "3": "Mixed use",
    "4": "Industrial",
    "5": "Undefined",
  },

  priceModifier: {
    "0": "None",
    "1": "Fixed price",
    "2": "Current offer",
    "3": "Guide price",
    "4": "Offers in region of",
    "5": "Offers over",
    "6": "POA (price not displayed)",
    "7": "Sale by Auction (price not displayed)",
  },

  coming_soon: { "0": "No", "1": "Yes" },
  propertySold: { "0": "No", "1": "Yes" },
  show_buy_it_now: { "0": "No", "1": "Yes" },

  utilities_connected: {
    "1": "Water",
    "2": "Electricity",
    "3": "Both",
    "4": "None",
  },
};

// decode(field, value)
//   • Returns the human-readable label if the field+value is in our map.
//   • Returns null for empty/missing values (caller skips the row).
//   • If the raw value looks like HTML (e.g. propertyLabel comes back as
//     "<span>Delivered</span>" from the API), strip the tags so callers get
//     the plain text.
//   • Returns the raw value as a final fallback if the code is unknown
//     (so internal users still see *something*).
export function decode(field, value) {
  if (value == null || value === "") return null;
  const raw = String(value);
  const map = LOOKUPS[field];
  if (map && map[raw] != null) return map[raw];
  if (raw.includes("<") && raw.includes(">")) {
    return raw.replace(/<[^>]+>/g, "").trim() || raw;
  }
  return raw;
}

// ── HubSpot reports (DATA-03) ────────────────────────────────────────────
// Canonical segmentation of HubSpot `hs_lead_status` internal values into
// the 10 reporting buckets. Source of truth: the gitignored
// `lead-status-segmentation` file (user-supplied 2026-05-16). The n8n
// aggregate keeps a synced copy of this same mapping. If the segmentation
// file changes, update BOTH here and the n8n workflow.
//
//   • empty / null hs_lead_status            → "not_contacted"
//   • value present and in the map           → that bucket
//   • value present but unknown              → "unmapped" (surfaced in UI,
//                                               never silently bucketed)
export const HS_LEAD_STATUS_BUCKETS = {
  "IN_PROGRESS":                 "in_progress",
  "Initiated WhatsApp Msg":      "in_progress",
  "CONNECTED":                   "connected",
  "Trial 1":                     "in_trials",
  "Trial 2":                     "in_trials",
  "Trial 3":                     "in_trials",
  "Trial 4":                     "in_trials",
  "Trial 5":                     "in_trials",
  "Unreachable":                 "unreachable",
  "LG MQL":                      "qualified",
  "LG Opportunity":              "qualified",
  "LG Qualified Lead BM":        "qualified",
  "Qualified (CRM)":             "crm_qualified",
  "Price":                       "not_qualified",
  "Location":                    "not_qualified",
  "Wrong Number":                "not_qualified",
  "Unqualified (Wrong Targeting)": "not_qualified",
  "LG Non-MQL":                  "not_qualified",
  "OPEN_DEAL":                   "not_qualified",
  "UNQUALIFIED":                 "not_qualified",
  "ATTEMPTED_TO_CONTACT":        "not_qualified",
  "BAD_TIMING":                  "not_qualified",
  "Disappeared":                 "not_qualified",
  "Deal-Breaker":                "not_qualified",
  "Contracted":                  "not_qualified",
  "Didn't Register":             "not_qualified",
  "Reschedule a Call":           "not_qualified",
  "Reconsidered":                "not_qualified",
  "Broker":                      "broker",
  "LG Non-Qualified - Seller":   "seller",
};

// Ordered: dictates the row order in the detail-view report card.
export const HS_LEAD_STATUS_BUCKET_LABELS = {
  not_contacted: "Not Contacted Yet",
  in_progress:   "In Progress",
  connected:     "Connected",
  in_trials:     "In Trials",
  unreachable:   "Unreachable",
  qualified:     "Qualified",
  crm_qualified: "CRM Qualified",
  not_qualified: "Not Qualified",
  broker:        "Broker",
  seller:        "Seller",
  unmapped:      "Unmapped",
};

// Resolve a raw hs_lead_status value to its bucket key.
export function leadStatusBucket(value) {
  if (value == null || String(value).trim() === "") return "not_contacted";
  return HS_LEAD_STATUS_BUCKETS[String(value)] || "unmapped";
}
