//! Named configuration profiles persisted to a JSON file in the app config
//! directory. The store is versioned so future schema changes can migrate
//! gracefully, and corrupt files fall back to a fresh store rather than
//! aborting the app.

use std::fs;
use std::path::PathBuf;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::clicker::ClickerConfig;

const STORE_VERSION: u32 = 1;
const STORE_FILENAME: &str = "profiles.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub config: ClickerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfilesFile {
    pub version: u32,
    pub profiles: Vec<Profile>,
    pub active_id: Option<String>,
}

impl Default for ProfilesFile {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            profiles: Vec::new(),
            active_id: None,
        }
    }
}

/// On-disk snapshot of the profile store, guarded by a Mutex so Tauri commands
/// can mutate it from any invocation thread.
pub struct ProfileStore {
    path: PathBuf,
    data: Mutex<ProfilesFile>,
}

impl ProfileStore {
    pub fn load(dir: PathBuf) -> anyhow::Result<Self> {
        fs::create_dir_all(&dir).ok();
        let path = dir.join(STORE_FILENAME);
        let data = match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str::<ProfilesFile>(&text).unwrap_or_else(|e| {
                eprintln!("blitzclick: profiles.json malformed ({e}); starting fresh");
                ProfilesFile::default()
            }),
            Err(_) => ProfilesFile::default(),
        };
        Ok(Self {
            path,
            data: Mutex::new(data),
        })
    }

    fn write(&self, data: &ProfilesFile) -> anyhow::Result<()> {
        let json = serde_json::to_string_pretty(data)?;
        fs::write(&self.path, json)?;
        Ok(())
    }

    pub fn snapshot(&self) -> ProfilesFile {
        self.data.lock().clone()
    }

    pub fn create(&self, name: String, config: ClickerConfig) -> anyhow::Result<Profile> {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            anyhow::bail!("profile name can't be empty");
        }
        let mut data = self.data.lock();
        if data.profiles.iter().any(|p| p.name.eq_ignore_ascii_case(&trimmed)) {
            anyhow::bail!("a profile named `{trimmed}` already exists");
        }
        let profile = Profile {
            id: new_id(),
            name: trimmed,
            config,
        };
        data.profiles.push(profile.clone());
        if data.active_id.is_none() {
            data.active_id = Some(profile.id.clone());
        }
        self.write(&data)?;
        Ok(profile)
    }

    pub fn rename(&self, id: &str, new_name: String) -> anyhow::Result<Profile> {
        let trimmed = new_name.trim().to_string();
        if trimmed.is_empty() {
            anyhow::bail!("profile name can't be empty");
        }
        let mut data = self.data.lock();
        if data
            .profiles
            .iter()
            .any(|p| p.id != id && p.name.eq_ignore_ascii_case(&trimmed))
        {
            anyhow::bail!("a profile named `{trimmed}` already exists");
        }
        let profile = data
            .profiles
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| anyhow::anyhow!("profile not found"))?;
        profile.name = trimmed;
        let out = profile.clone();
        self.write(&data)?;
        Ok(out)
    }

    pub fn delete(&self, id: &str) -> anyhow::Result<()> {
        let mut data = self.data.lock();
        let before = data.profiles.len();
        data.profiles.retain(|p| p.id != id);
        if data.profiles.len() == before {
            anyhow::bail!("profile not found");
        }
        if data.active_id.as_deref() == Some(id) {
            data.active_id = data.profiles.first().map(|p| p.id.clone());
        }
        self.write(&data)?;
        Ok(())
    }

    pub fn save_config(&self, id: &str, config: ClickerConfig) -> anyhow::Result<Profile> {
        let mut data = self.data.lock();
        let profile = data
            .profiles
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| anyhow::anyhow!("profile not found"))?;
        profile.config = config;
        let out = profile.clone();
        self.write(&data)?;
        Ok(out)
    }

    pub fn set_active(&self, id: Option<String>) -> anyhow::Result<()> {
        let mut data = self.data.lock();
        if let Some(ref target) = id
            && !data.profiles.iter().any(|p| p.id == *target)
        {
            anyhow::bail!("profile not found");
        }
        data.active_id = id;
        self.write(&data)?;
        Ok(())
    }

    pub fn find(&self, id: &str) -> Option<Profile> {
        self.data.lock().profiles.iter().find(|p| p.id == id).cloned()
    }

    pub fn export_json(&self, id: &str) -> anyhow::Result<String> {
        let profile = self
            .find(id)
            .ok_or_else(|| anyhow::anyhow!("profile not found"))?;
        let payload = ExportEnvelope {
            kind: "blitzclick.profile".to_string(),
            version: STORE_VERSION,
            profile,
        };
        Ok(serde_json::to_string_pretty(&payload)?)
    }

    pub fn import_json(&self, text: &str) -> anyhow::Result<Profile> {
        let envelope: ExportEnvelope = serde_json::from_str(text)
            .map_err(|e| anyhow::anyhow!("not a valid blitzclick profile file: {e}"))?;
        if envelope.kind != "blitzclick.profile" {
            anyhow::bail!("file isn't a blitzclick profile (kind=`{}`)", envelope.kind);
        }
        if envelope.version > STORE_VERSION {
            anyhow::bail!(
                "profile was exported from a newer blitzclick (v{})",
                envelope.version
            );
        }

        let mut data = self.data.lock();
        let mut incoming = envelope.profile;
        incoming.id = new_id();
        let base_name = incoming.name.clone();
        let mut suffix = 2u32;
        while data
            .profiles
            .iter()
            .any(|p| p.name.eq_ignore_ascii_case(&incoming.name))
        {
            incoming.name = format!("{base_name} ({suffix})");
            suffix += 1;
        }
        data.profiles.push(incoming.clone());
        self.write(&data)?;
        Ok(incoming)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExportEnvelope {
    kind: String,
    version: u32,
    profile: Profile,
}

fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("prof_{:x}", nanos)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn fresh() -> (TempDir, ProfileStore) {
        let dir = TempDir::new().unwrap();
        let store = ProfileStore::load(dir.path().to_path_buf()).unwrap();
        (dir, store)
    }

    #[test]
    fn create_and_persist_roundtrips() {
        let (dir, store) = fresh();
        let cfg = ClickerConfig::default();
        let p = store.create("Default".to_string(), cfg).unwrap();
        assert_eq!(p.name, "Default");

        let store2 = ProfileStore::load(dir.path().to_path_buf()).unwrap();
        let snap = store2.snapshot();
        assert_eq!(snap.profiles.len(), 1);
        assert_eq!(snap.profiles[0].id, p.id);
        assert_eq!(snap.active_id.as_deref(), Some(p.id.as_str()));
    }

    #[test]
    fn create_rejects_blank_and_duplicate_names() {
        let (_dir, store) = fresh();
        let cfg = ClickerConfig::default();
        store.create("A".to_string(), cfg.clone()).unwrap();
        assert!(store.create("A".to_string(), cfg.clone()).is_err());
        assert!(store.create("  a  ".to_string(), cfg.clone()).is_err());
        assert!(store.create("   ".to_string(), cfg).is_err());
    }

    #[test]
    fn delete_rebinds_active() {
        let (_dir, store) = fresh();
        let cfg = ClickerConfig::default();
        let a = store.create("A".to_string(), cfg.clone()).unwrap();
        let b = store.create("B".to_string(), cfg).unwrap();
        store.set_active(Some(a.id.clone())).unwrap();
        store.delete(&a.id).unwrap();
        let snap = store.snapshot();
        assert_eq!(snap.active_id.as_deref(), Some(b.id.as_str()));
    }

    #[test]
    fn export_import_cycle() {
        let (_dir, store) = fresh();
        let cfg = ClickerConfig::default();
        let p = store.create("Round".to_string(), cfg).unwrap();
        let json = store.export_json(&p.id).unwrap();
        let imported = store.import_json(&json).unwrap();
        assert!(imported.name.starts_with("Round"));
        assert_ne!(imported.id, p.id);
    }

    #[test]
    fn import_rejects_wrong_kind() {
        let (_dir, store) = fresh();
        let json = r#"{"kind":"something-else","version":1,"profile":{"id":"x","name":"y","config":{"action":{"kind":"MouseLeft"},"interval_ms":50,"stop_after":null,"hotkey":{"code":"F6","shift":false,"ctrl":false,"alt":false,"meta":false}}}}"#;
        assert!(store.import_json(json).is_err());
    }

    #[test]
    fn malformed_file_recovers_to_empty() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(STORE_FILENAME), "not json at all").unwrap();
        let store = ProfileStore::load(dir.path().to_path_buf()).unwrap();
        assert!(store.snapshot().profiles.is_empty());
    }
}
