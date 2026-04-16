use std::sync::Arc;

use sqlx::PgPool;

use crate::config::Config;
use crate::crypto::MasterKey;
use crate::scheduler::SchedulerHandle;

#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<Inner>,
}

pub struct Inner {
    pub pool: PgPool,
    pub config: Config,
    pub master_key: MasterKey,
    pub scheduler: SchedulerHandle,
}

impl AppState {
    pub fn new(pool: PgPool, config: Config, master_key: MasterKey) -> Self {
        Self {
            inner: Arc::new(Inner {
                pool,
                config,
                master_key,
                scheduler: SchedulerHandle::default(),
            }),
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.inner.pool
    }

    pub fn config(&self) -> &Config {
        &self.inner.config
    }

    pub fn master_key(&self) -> &MasterKey {
        &self.inner.master_key
    }

    pub fn scheduler(&self) -> &SchedulerHandle {
        &self.inner.scheduler
    }
}
