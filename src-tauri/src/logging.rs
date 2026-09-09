//! Structured logging setup with tracing.

use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

/// Initializes the global tracing subscriber with JSON output for production
/// and pretty output for development.
pub fn init_logging() {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,kubelens=debug,tauri=warn"));

    #[cfg(debug_assertions)]
    {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(tracing_subscriber::fmt::layer().pretty())
            .init();
    }

    #[cfg(not(debug_assertions))]
    {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(
                tracing_subscriber::fmt::layer()
                    .json()
                    .with_current_span(true)
                    .with_span_list(true),
            )
            .init();
    }
}

/// Generates a correlation ID for request tracing.
pub fn correlation_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
