//! Token bucket rate limiter for Tauri commands.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Rate limiter configuration for a command group.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Maximum requests allowed in the time window.
    pub max_requests: u32,
    /// Time window for the rate limit.
    pub window: Duration,
}

/// A token bucket rate limiter.
pub struct RateLimiter {
    buckets: Arc<Mutex<HashMap<String, TokenBucket>>>,
    configs: HashMap<String, RateLimitConfig>,
    default_config: RateLimitConfig,
}

struct TokenBucket {
    tokens: f64,
    last_refill: Instant,
    capacity: u32,
    refill_rate: f64, // tokens per second
}

impl RateLimiter {
    /// Creates a new rate limiter with default config.
    pub fn new(default_max_requests: u32, default_window: Duration) -> Self {
        Self {
            buckets: Arc::new(Mutex::new(HashMap::new())),
            configs: HashMap::new(),
            default_config: RateLimitConfig {
                max_requests: default_max_requests,
                window: default_window,
            },
        }
    }

    /// Sets a specific config for a command group.
    pub fn set_config(&mut self, group: &str, config: RateLimitConfig) {
        self.configs.insert(group.to_string(), config);
    }

    /// Checks if a request is allowed for the given group and key.
    /// Returns (allowed, retry_after).
    pub fn check(&self, group: &str, key: &str) -> (bool, Option<Duration>) {
        let config = self.configs.get(group).unwrap_or(&self.default_config);
        let mut buckets = self.buckets.lock().unwrap();
        let bucket_key = format!("{group}:{key}");

        let bucket = buckets.entry(bucket_key).or_insert_with(|| TokenBucket {
            tokens: config.max_requests as f64,
            last_refill: Instant::now(),
            capacity: config.max_requests,
            refill_rate: config.max_requests as f64 / config.window.as_secs_f64(),
        });

        let now = Instant::now();
        let elapsed = now.duration_since(bucket.last_refill).as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * bucket.refill_rate).min(bucket.capacity as f64);
        bucket.last_refill = now;

        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            (true, None)
        } else {
            let retry_after = Duration::from_secs_f64((1.0 - bucket.tokens) / bucket.refill_rate);
            (false, Some(retry_after))
        }
    }

    /// Clears old buckets to prevent memory growth.
    pub fn cleanup_old_buckets(&self, max_age: Duration) {
        let mut buckets = self.buckets.lock().unwrap();
        let now = Instant::now();
        buckets.retain(|_, bucket| now.duration_since(bucket.last_refill) < max_age);
    }
}

/// Global rate limiter instance.
static RATE_LIMITER: std::sync::OnceLock<RateLimiter> = std::sync::OnceLock::new();

/// Initializes the global rate limiter with default configs.
pub fn init_rate_limiter() {
    let mut limiter = RateLimiter::new(100, Duration::from_secs(60)); // Default: 100 req/min

    // Command group configs
    limiter.set_config(
        "port_forward",
        RateLimitConfig {
            max_requests: 10,
            window: Duration::from_secs(60),
        },
    );
    limiter.set_config(
        "exec",
        RateLimitConfig {
            max_requests: 5,
            window: Duration::from_secs(60),
        },
    );
    limiter.set_config(
        "logs",
        RateLimitConfig {
            max_requests: 10,
            window: Duration::from_secs(60),
        },
    );
    limiter.set_config(
        "mutating",
        RateLimitConfig {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    );
    limiter.set_config(
        "watch",
        RateLimitConfig {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    );

    RATE_LIMITER.set(limiter).ok();
}

/// Gets the global rate limiter.
pub fn rate_limiter() -> &'static RateLimiter {
    RATE_LIMITER.get_or_init(|| {
        let mut limiter = RateLimiter::new(100, Duration::from_secs(60));
        limiter.set_config(
            "port_forward",
            RateLimitConfig {
                max_requests: 10,
                window: Duration::from_secs(60),
            },
        );
        limiter.set_config(
            "exec",
            RateLimitConfig {
                max_requests: 5,
                window: Duration::from_secs(60),
            },
        );
        limiter.set_config(
            "logs",
            RateLimitConfig {
                max_requests: 10,
                window: Duration::from_secs(60),
            },
        );
        limiter.set_config(
            "mutating",
            RateLimitConfig {
                max_requests: 30,
                window: Duration::from_secs(60),
            },
        );
        limiter.set_config(
            "watch",
            RateLimitConfig {
                max_requests: 20,
                window: Duration::from_secs(60),
            },
        );
        limiter
    })
}

/// Checks rate limit for a command group and returns an error if exceeded.
pub fn check_rate_limit(group: &str, key: &str) -> Result<(), String> {
    let (allowed, retry_after) = rate_limiter().check(group, key);
    if allowed {
        Ok(())
    } else {
        let retry_secs = retry_after.unwrap_or(Duration::from_secs(60)).as_secs();
        Err(format!(
            "Rate limit exceeded for {group}. Try again in {retry_secs} seconds."
        ))
    }
}
