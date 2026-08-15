"""Diverse agent blueprints for Stack32 Builder capability / knowledge stress tests.

These are offline scenarios (no Live OAuth). They feed app_hints coverage,
capability resolution, and orchestrator learning docs — not production agent rows.
"""

from __future__ import annotations

# Each scenario: id, prompt (EN — Builder prompts stay English), expected_apps (subset).
AGENT_SCENARIOS: list[dict] = [
    # Research / writing
    {"id": "blog-rewriter", "prompt": "Rewrite blog posts in a friendly tone", "expected_apps": []},
    {"id": "web-researcher", "prompt": "Research companies online and summarize findings", "expected_apps": []},
    {"id": "fact-checker", "prompt": "Fact check claims using web search", "expected_apps": []},
    # Google suite
    {"id": "gmail-triage", "prompt": "Read my Gmail and draft replies", "expected_apps": ["gmail"]},
    {"id": "gmail-send", "prompt": "Send follow-up emails via Gmail after meetings", "expected_apps": ["gmail"]},
    {"id": "calendar-scheduler", "prompt": "Schedule meetings on Google Calendar and list upcoming events", "expected_apps": ["google_calendar"]},
    {"id": "meet-prep", "prompt": "Prepare meetings using Calendar Gmail Notion and Canva", "expected_apps": ["google_calendar", "gmail", "notion", "canva"]},
    {"id": "docs-summarizer", "prompt": "Create a Google Docs summary and update it each assignment", "expected_apps": ["google_docs"]},
    {"id": "sheets-crm", "prompt": "Log leads into Google Sheets rows", "expected_apps": ["google_sheets"]},
    {"id": "drive-organizer", "prompt": "Organize files in Google Drive folders", "expected_apps": ["google_drive"]},
    # Notion / knowledge
    {"id": "notion-notes", "prompt": "Save meeting notes into Notion pages", "expected_apps": ["notion"]},
    {"id": "notion-db", "prompt": "Add CRM rows to a Notion database", "expected_apps": ["notion"]},
    {"id": "notion-wiki", "prompt": "Update our Notion wiki after research", "expected_apps": ["notion"]},
    # Slack / Discord / Teams
    {"id": "slack-standup", "prompt": "Post daily standup updates to Slack channels", "expected_apps": ["slack"]},
    {"id": "slack-alerts", "prompt": "Alert the team on Slack when a deal closes", "expected_apps": ["slack"]},
    {"id": "discord-mod", "prompt": "Post announcements in Discord channels", "expected_apps": ["discord"]},
    {"id": "teams-bot", "prompt": "Send Microsoft Teams channel messages for incidents", "expected_apps": ["microsoft_teams"]},
    # Design
    {"id": "canva-deck", "prompt": "Create Canva presentation decks for clients", "expected_apps": ["canva"]},
    {"id": "canva-social", "prompt": "Generate Canva social graphics for campaigns", "expected_apps": ["canva"]},
    {"id": "figma-handoff", "prompt": "Pull Figma design comments into a summary", "expected_apps": ["figma"]},
    # Payments / CRM
    {"id": "stripe-invoices", "prompt": "Create Stripe invoices for customers", "expected_apps": ["stripe"]},
    {"id": "stripe-refunds", "prompt": "Help process Stripe refunds with approvals", "expected_apps": ["stripe"]},
    {"id": "hubspot-crm", "prompt": "Update HubSpot contacts and deals", "expected_apps": ["hubspot"]},
    {"id": "salesforce-sync", "prompt": "Sync opportunities in Salesforce", "expected_apps": ["salesforce"]},
    {"id": "pipedrive-deals", "prompt": "Manage Pipedrive deals and activities", "expected_apps": ["pipedrive"]},
    # Support
    {"id": "zendesk-tickets", "prompt": "Create and update Zendesk support tickets", "expected_apps": ["zendesk"]},
    {"id": "intercom-replies", "prompt": "Draft Intercom replies for customers", "expected_apps": ["intercom"]},
    {"id": "freshdesk-queue", "prompt": "Triage Freshdesk tickets by priority", "expected_apps": ["freshdesk"]},
    # Project mgmt
    {"id": "linear-bugs", "prompt": "Create Linear issues from bug reports", "expected_apps": ["linear"]},
    {"id": "jira-sprint", "prompt": "Create Jira tickets for sprint work", "expected_apps": ["jira"]},
    {"id": "asana-tasks", "prompt": "Assign Asana tasks after meetings", "expected_apps": ["asana"]},
    {"id": "trello-board", "prompt": "Add Trello cards for new leads", "expected_apps": ["trello"]},
    {"id": "clickup-ops", "prompt": "Track ops work in ClickUp", "expected_apps": ["clickup"]},
    {"id": "monday-projects", "prompt": "Update Monday.com project boards", "expected_apps": ["monday"]},
    # Dev
    {"id": "github-issues", "prompt": "Create GitHub issues from user feedback", "expected_apps": ["github"]},
    {"id": "github-prs", "prompt": "Summarize GitHub pull requests", "expected_apps": ["github"]},
    {"id": "gitlab-mrs", "prompt": "Track GitLab merge requests", "expected_apps": ["gitlab"]},
    # Airtable / databases
    {"id": "airtable-inventory", "prompt": "Update Airtable inventory bases and tables", "expected_apps": ["airtable"]},
    {"id": "supabase-ops", "prompt": "Query Supabase tables for ops metrics", "expected_apps": ["supabase"]},
    # Marketing / social
    {"id": "mailchimp-campaign", "prompt": "Draft Mailchimp email campaigns", "expected_apps": ["mailchimp"]},
    {"id": "klaviyo-flows", "prompt": "Trigger Klaviyo flows for new subscribers", "expected_apps": ["klaviyo"]},
    {"id": "twitter-posts", "prompt": "Draft Twitter posts for product launches", "expected_apps": ["twitter"]},
    {"id": "linkedin-posts", "prompt": "Draft LinkedIn posts for thought leadership", "expected_apps": ["linkedin"]},
    {"id": "instagram-caption", "prompt": "Write Instagram captions for product shots", "expected_apps": ["instagram"]},
    {"id": "youtube-scripts", "prompt": "Write YouTube video scripts from briefs", "expected_apps": ["youtube"]},
    # Commerce
    {"id": "shopify-orders", "prompt": "Check Shopify orders and update fulfillment notes", "expected_apps": ["shopify"]},
    {"id": "woocommerce-stock", "prompt": "Monitor WooCommerce stock levels", "expected_apps": ["woocommerce"]},
    # Storage / files
    {"id": "dropbox-archive", "prompt": "Archive reports to Dropbox folders", "expected_apps": ["dropbox"]},
    {"id": "box-share", "prompt": "Share Box files with clients", "expected_apps": ["box"]},
    {"id": "onedrive-docs", "prompt": "Organize OneDrive documents for the team", "expected_apps": ["microsoft_onedrive"]},
    # Comms
    {"id": "twilio-sms", "prompt": "Send Twilio SMS reminders for appointments", "expected_apps": ["twilio"]},
    {"id": "telegram-bot", "prompt": "Post Telegram bot alerts for outages", "expected_apps": ["telegram"]},
    {"id": "whatsapp-notify", "prompt": "Send WhatsApp business notifications", "expected_apps": ["whatsapp"]},
    {"id": "zoom-meetings", "prompt": "Schedule Zoom meetings and share links", "expected_apps": ["zoom"]},
    {"id": "outlook-mail", "prompt": "Draft emails in Microsoft Outlook", "expected_apps": ["microsoft_outlook"]},
    # Multi-tool combos
    {"id": "sales-ops", "prompt": "CRM agent using HubSpot Slack and Google Sheets", "expected_apps": ["hubspot", "slack", "google_sheets"]},
    {"id": "content-studio", "prompt": "Content studio with Notion Canva and Slack", "expected_apps": ["notion", "canva", "slack"]},
    {"id": "support-desk", "prompt": "Support desk with Zendesk Gmail and Notion", "expected_apps": ["zendesk", "gmail", "notion"]},
    {"id": "eng-triage", "prompt": "Engineering triage with Linear GitHub and Slack", "expected_apps": ["linear", "github", "slack"]},
    {"id": "finance-bot", "prompt": "Finance helper with Stripe Google Sheets and Slack", "expected_apps": ["stripe", "google_sheets", "slack"]},
    {"id": "hr-onboard", "prompt": "HR onboarding with Notion Gmail and Google Calendar", "expected_apps": ["notion", "gmail", "google_calendar"]},
    {"id": "recruiting", "prompt": "Recruiting assistant with Gmail Notion and Airtable", "expected_apps": ["gmail", "notion", "airtable"]},
    {"id": "ecommerce-ops", "prompt": "Ecommerce ops with Shopify Slack and Google Sheets", "expected_apps": ["shopify", "slack", "google_sheets"]},
    {"id": "legal-research", "prompt": "Legal research agent with web search and Notion notes", "expected_apps": ["notion"]},
    {"id": "investor-update", "prompt": "Investor updates via Gmail Notion and Canva", "expected_apps": ["gmail", "notion", "canva"]},
    {"id": "product-feedback", "prompt": "Product feedback into Linear and Notion from Slack", "expected_apps": ["linear", "notion", "slack"]},
    {"id": "seo-writer", "prompt": "SEO writer that researches the web and saves drafts to Google Docs", "expected_apps": ["google_docs"]},
    {"id": "podcast-notes", "prompt": "Podcast notes into Notion and Discord announcements", "expected_apps": ["notion", "discord"]},
    {"id": "event-planner", "prompt": "Event planner with Calendar Gmail and Slack", "expected_apps": ["google_calendar", "gmail", "slack"]},
    {"id": "real-estate", "prompt": "Real estate agent with Gmail Sheets and Canva flyers", "expected_apps": ["gmail", "google_sheets", "canva"]},
    {"id": "classroom", "prompt": "Classroom helper with Google Docs Calendar and Gmail", "expected_apps": ["google_docs", "google_calendar", "gmail"]},
    {"id": "nonprofit", "prompt": "Nonprofit donor CRM with Airtable Mailchimp and Slack", "expected_apps": ["airtable", "mailchimp", "slack"]},
    {"id": "agency-client", "prompt": "Agency client updates with Asana Slack and Notion", "expected_apps": ["asana", "slack", "notion"]},
    {"id": "devtools", "prompt": "Devtools bot with GitHub and Discord", "expected_apps": ["github", "discord"]},
    {"id": "data-analyst", "prompt": "Data analyst exporting Snowflake queries to Sheets", "expected_apps": ["snowflake", "google_sheets"]},
    {"id": "security-oncall", "prompt": "Security oncall posting PagerDuty style alerts to Slack and creating Jira", "expected_apps": ["slack", "jira"]},
    {"id": "video-pipeline", "prompt": "Video pipeline notes in Notion and YouTube title drafts", "expected_apps": ["notion", "youtube"]},
    {"id": "influencer", "prompt": "Influencer outreach via Gmail Instagram and Canva", "expected_apps": ["gmail", "instagram", "canva"]},
    {"id": "b2b-sdr", "prompt": "B2B SDR using HubSpot Gmail LinkedIn and Calendar", "expected_apps": ["hubspot", "gmail", "linkedin", "google_calendar"]},
    {"id": "customer-success", "prompt": "Customer success with Intercom Notion and Slack", "expected_apps": ["intercom", "notion", "slack"]},
    {"id": "ops-runbook", "prompt": "Ops runbook executor logging to Notion and alerting Slack", "expected_apps": ["notion", "slack"]},
    {"id": "translation", "prompt": "Translate product copy and store in Google Docs", "expected_apps": ["google_docs"]},
    {"id": "qa-tester", "prompt": "QA notes into Linear and GitHub issues", "expected_apps": ["linear", "github"]},
    {"id": "board-deck", "prompt": "Board deck builder with Canva and Google Drive", "expected_apps": ["canva", "google_drive"]},
    {"id": "invoice-chase", "prompt": "Chase unpaid Stripe invoices via Gmail and Slack", "expected_apps": ["stripe", "gmail", "slack"]},
    {"id": "community", "prompt": "Community manager for Discord Slack and Twitter", "expected_apps": ["discord", "slack", "twitter"]},
    {"id": "knowledge-rag", "prompt": "Answer from uploaded knowledge documents with citations", "expected_apps": []},
    {"id": "memory-coach", "prompt": "Personal coach that remembers prior conversations", "expected_apps": []},
    {"id": "calculator-helper", "prompt": "Help with calculations and current date time", "expected_apps": []},
    {"id": "multi-research", "prompt": "Deep research with web search knowledge and Notion archive", "expected_apps": ["notion"]},
    {"id": "fr-meet-prep", "prompt": "Prépare mes réunions avec Google Calendar Gmail Notion et Canva", "expected_apps": ["google_calendar", "gmail", "notion", "canva"]},
    {"id": "fr-slack-sales", "prompt": "Agent commercial HubSpot Slack et Sheets", "expected_apps": ["hubspot", "slack", "google_sheets"]},
    {"id": "excel-report", "prompt": "Build Excel reports from CRM data", "expected_apps": ["microsoft_excel"]},
    {"id": "sendgrid-drip", "prompt": "Send transactional emails with SendGrid", "expected_apps": ["sendgrid"]},
    {"id": "aws-s3-archive", "prompt": "Archive exports to AWS S3", "expected_apps": ["aws"]},
    {"id": "mongodb-lookup", "prompt": "Look up customer records in MongoDB", "expected_apps": ["mongodb"]},
    {"id": "postgres-query", "prompt": "Run safe read-only PostgreSQL queries for analytics", "expected_apps": ["postgresql"]},
    {"id": "mysql-inventory", "prompt": "Check MySQL inventory tables", "expected_apps": ["mysql"]},
    {"id": "facebook-ads", "prompt": "Draft Facebook campaign copy", "expected_apps": ["facebook"]},
    {"id": "trello-slack", "prompt": "Move Trello cards and notify Slack", "expected_apps": ["trello", "slack"]},
    {"id": "gitlab-notion", "prompt": "Sync GitLab issues summaries into Notion", "expected_apps": ["gitlab", "notion"]},
    {"id": "zoom-notion", "prompt": "After Zoom meetings save notes to Notion", "expected_apps": ["zoom", "notion"]},
    {"id": "dropbox-canva", "prompt": "Store Canva exports into Dropbox", "expected_apps": ["canva", "dropbox"]},
    {"id": "full-stack-ops", "prompt": "Ops agent with GitHub Linear Slack Notion and Gmail", "expected_apps": ["github", "linear", "slack", "notion", "gmail"]},
]

assert len(AGENT_SCENARIOS) >= 50, len(AGENT_SCENARIOS)
