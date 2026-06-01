# Ferocity Marketing OS Implementation Checklist

Source: duplicated pasted notes from June 1, 2026. This file de-duplicates the two identical pastes and turns them into the working implementation checklist.

## Mission

Ferocity should be the easiest marketing platform a small business owner has ever used.

The average contractor should be able to sign up, answer a few questions, click one button, and have most of their marketing system built automatically.

The goal is not another complicated CRM. The goal is an AI-powered marketing department and business growth platform.

## Guardrails

- [x] Do not break auth.
- [x] Do not break RLS.
- [x] Do not break CRM, leads, reviews, websites, messaging, automations, billing, customer portal, or existing database structures.
- [x] Build as modular additions.
- [x] Nothing auto-publishes by default.
- [x] Live sends, publishing, billing, ads, video generation, and provider sync stay gated by credentials, approval rules, and usage limits.

## Core Philosophy

- [x] Keep the default experience simple.
- [x] Use progressive disclosure: Quick Setup, AI Setup, Advanced Settings.
- [x] Add obvious setup entry points with plain language.
- [x] Keep advanced controls available for power users.

## Implementation Order

1. [x] Preserve the pasted spec in this markdown file.
2. [x] Audit existing Ferocity coverage so we do not rebuild existing setup, content, approvals, billing gates, proof, publishing queue, or automations.
3. [x] Add Marketing OS database foundations.
4. [x] Add Business Profile Memory foundation.
5. [x] Add Website Import request foundation.
6. [x] Add Content Studio campaign and output foundation.
7. [x] Add Media Library foundation.
8. [x] Add review graphic and before/after graphic job foundations.
9. [x] Add provider-agnostic video job foundation.
10. [x] Add one-click campaign blueprint foundation.
11. [x] Add flexible feature gates and usage limits for the new Marketing OS features.
12. [x] Add a simple app surface that normal business owners can understand.
13. [x] Add "Have AI Set This Up" and "Have AI Update This For Me" entry points.
14. [x] Keep all generated work draft/review-first.
15. [x] Run migration, typecheck, build, and production readiness checks.

## AI Setup Assistant

- [x] Prominent global setup entry point exists.
- [x] Add "Have AI Set This Up" wording.
- [x] Add "Have AI Update This For Me" wording.
- [x] Keep setup assistant as the primary onboarding path.
- [x] Let users describe normal-business requests like roofing, landscaping, cleaning, storm leads, reviews, SEO, and follow-up.
- [x] Generate safe setup plans before applying.
- [x] Create profile/services/service areas/content/reviews/SEO/calendar/workflow foundations without forcing manual settings.

## Business Profile Memory

- [x] Store company name.
- [x] Store services.
- [x] Store service areas.
- [x] Store team members.
- [x] Store phone numbers.
- [x] Store emails.
- [x] Store website.
- [x] Store social links.
- [x] Store FAQs.
- [x] Store offers.
- [x] Store brand voice.
- [x] Store ideal customers.
- [x] Store reviews/proof references.
- [x] Store uploaded asset references.
- [x] Make the profile available for AI/content systems.

## Website Scrape Mode

- [x] Add Import From Website request path.
- [x] Store entered website URL.
- [x] Prepare extraction fields for company name, services, service areas, about copy, FAQs, reviews, contact info, and marketing content.
- [x] Keep imported data editable and review-first.
- [x] Do not claim live scraping/provider extraction is active unless connected.

## Manual Setup Mode

- [x] Manual business profile fields exist.
- [x] Manual services and service areas are supported through existing brand/service/location records.
- [x] Manual website, phone, email, brand tone, offers, and team data are supported in Marketing OS memory.

## Content Studio

- [x] Add a single Content Studio style workflow.
- [x] Support plain prompt input such as "Create a hail damage campaign."
- [x] Generate or prepare social posts, GBP posts, blog articles, emails, SMS campaigns, landing pages, and ad copy as draft outputs.
- [x] Keep content in a review workflow.

## Content Types

- [x] Facebook posts.
- [x] Instagram posts.
- [x] LinkedIn posts.
- [x] X posts.
- [x] TikTok captions.
- [x] GBP posts.
- [x] Blog articles.
- [x] Email campaigns.
- [x] SMS campaigns.
- [x] Landing pages.
- [x] Seasonal promotions.
- [x] Referral campaigns.
- [x] Service campaigns.
- [x] Review campaigns.
- [x] Storm campaigns.
- [x] Promotional campaigns.

## Media Library

- [x] Add media library table foundation.
- [x] Support photos.
- [x] Support logos.
- [x] Support videos.
- [x] Organize by service, campaign, project, and tags.
- [x] Track approved media that AI can reuse.

## Review Graphics

- [x] Add branded review graphic job foundation.
- [x] Support Facebook format.
- [x] Support Instagram format.
- [x] Support Story format.

## Before / After System

- [x] Add before/after graphic job foundation.
- [x] Support before photo reference.
- [x] Support after photo reference.
- [x] Support side-by-side, comparison graphic, and social media output intent.
- [x] Apply branding metadata.

## AI Image Ads

- [x] Add image ad graphic job foundation.
- [x] Support Facebook ad format.
- [x] Support Instagram ad format.
- [x] Support display ad format.
- [x] Use business profile, service area, and approved branding metadata.

## Video System

- [x] Add provider-agnostic video architecture.
- [x] Do not lock to one vendor.
- [x] Prepare future providers: OpenAI, Runway, Kling, Pika, future provider.
- [x] Store video jobs, requests, provider status, script, scenes, voiceover, CTA, and history.
- [x] Keep provider submission disabled until keys and approvals exist.

## Auto Posting / Publishing Architecture

- [x] Existing publishing queue supports draft/scheduled/published states.
- [x] Marketing OS content outputs can feed review-first export/publishing queues.
- [x] Future integrations stay provider-ready: Facebook, Instagram, GBP, LinkedIn, X, TikTok.
- [x] Support draft, schedule, publish-now intent, and approval required states without enabling live publishing by default.

## Content Calendar

- [x] Existing marketing calendar remains the calendar foundation.
- [x] Marketing OS links users to the calendar.
- [x] Existing statuses support draft, scheduled/upcoming, approved/published, failed/rejected style review flow.
- [x] Filters can remain future UI polish; data foundation includes platform, campaign, and content type.

## Approval Workflow

- [x] Generate.
- [x] Review.
- [x] Edit.
- [x] Approve.
- [x] Publish manually/provider-ready.
- [x] Full auto mode can be enabled later by feature gates, not by default.

## One-Click Campaigns

- [x] Create Storm Campaign.
- [x] Create Review Campaign.
- [x] Create Referral Campaign.
- [x] Create Seasonal Campaign.
- [x] Create New Customer Campaign.
- [x] Create Lead Reactivation Campaign.
- [x] Campaign buttons generate draft campaign/output records, not live sends or publishing.

## Tier System

- [x] Flexible feature gates already exist.
- [x] Add Marketing OS feature gates and usage limits.
- [x] Add plan matrix rows without hardcoding current pricing.
- [x] Support free features, plan features, credit features, usage-based features, and admin-configurable metadata.

## Included Features

- [x] Social posts.
- [x] Blogs.
- [x] GBP posts.
- [x] Review graphics.
- [x] Before/after graphics.
- [x] Content calendar.
- [x] AI setup assistant.
- [x] Auto-posting architecture.
- [x] Configurable by plan through plan matrix and workspace entitlements.

## Usage-Based Features

- [x] AI video generation.
- [x] Voice AI placeholder.
- [x] SMS.
- [x] Bulk email.
- [x] Premium AI tasks.
- [x] Future metered services.
- [x] Credits, included monthly allowances, and overage policies are represented in entitlement metadata.

## Simple Mode

- [x] Marketing OS page includes Quick Setup, AI Setup, and Advanced Settings sections.
- [x] Main flow uses plain English.
- [x] Advanced controls link out instead of crowding the main experience.

## Final Goal

- [x] Product surface supports: "Tell us about your business and we'll build your marketing department."
- [x] Users can get value quickly through setup, profile memory, one-click campaigns, content drafts, media/proof, approval queues, and controls.
- [x] Foundations are modular and scale without merging everything into a confusing mega-app.
