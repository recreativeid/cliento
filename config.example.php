<?php
/**
 * Example local configuration template.
 * Copy this file to 'config.local.php' and insert your personal API keys.
 */
return [
    'GEMINI_API_KEY' => '',
    'GOOGLE_MAPS_API_KEY' => '',
    // Optional paid adapter; the primary workflow imports Google Maps Chrome exports.
    'GOOGLE_PLACES_ENABLED' => false,
    'GOOGLE_PLACES_MAX_PAGES' => 3,

    // Cloud Scraping Multi-API (Waterfall Failover: Apify -> Outscraper -> SerpApi)
    'APIFY_TOKEN' => '',        // Gratis $5/bulan (~1.000-2.000 tempat)
    'OUTSCRAPER_API_KEY' => '', // Gratis 500 tempat/bulan
    'SERPAPI_API_KEY' => '',    // Gratis 100 search/bulan
];
