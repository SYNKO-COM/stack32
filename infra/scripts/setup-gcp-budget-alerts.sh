#!/usr/bin/env bash
# Create monthly GCP billing budget alerts for project stack32.
# Emails go to Billing Account Administrators / Users on the GCP account.
#
# Usage:
#   ./infra/scripts/setup-gcp-budget-alerts.sh [BILLING_ACCOUNT_ID]
#
# Example:
#   ./infra/scripts/setup-gcp-budget-alerts.sh 01CDD1-50AE55-12EED8

set -euo pipefail

BILLING_ACCOUNT="${1:-01CDD1-50AE55-12EED8}"
PROJECT_ID="${GCP_PROJECT_ID:-stack32}"
THRESHOLDS=(20 50 100 500 1000 5000)

echo "Enabling Cloud Billing Budget API on ${PROJECT_ID}…"
gcloud services enable billingbudgets.googleapis.com --project="${PROJECT_ID}"

for amount in "${THRESHOLDS[@]}"; do
  name="Stack32 — alerte ${amount} €"
  if gcloud billing budgets list --billing-account="${BILLING_ACCOUNT}" \
    --format='value(displayName)' 2>/dev/null | grep -Fx "${name}" >/dev/null; then
    echo "Skip (exists): ${name}"
    continue
  fi
  echo "Creating: ${name}"
  gcloud billing budgets create \
    --billing-account="${BILLING_ACCOUNT}" \
    --display-name="${name}" \
    --budget-amount="${amount}EUR" \
    --calendar-period=month \
    --filter-projects="projects/${PROJECT_ID}" \
    --threshold-rule=percent=1.0,basis=current-spend \
    --threshold-rule=percent=1.0,basis=forecasted-spend
done

echo "Done. Budgets:"
gcloud billing budgets list --billing-account="${BILLING_ACCOUNT}" \
  --format='table(displayName,amount.specifiedAmount.units,amount.specifiedAmount.currencyCode)'
