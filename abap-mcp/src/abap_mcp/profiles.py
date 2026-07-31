"""Per-client connection profiles.

A profile is a YAML file in ABAP_MCP_PROFILE_DIR (default ./profiles).
Credentials are NEVER stored in the YAML — they are resolved from
environment variables named ABAP_MCP_<PROFILE_ID>_USER / _PASS
(profile id uppercased, dashes -> underscores).

Example profile (profiles/acme-dev.yaml):

    id: acme-dev
    client_name: "ACME Sdn Bhd"          # human label, appears in tool output
    base_url: "https://acmedev.example.com:44300"
    sap_client: "100"
    language: "EN"
    release: "S4HANA-2023"               # informational; affects parser quirks
    verify_tls: true
    allow_write: false                   # v0.1 ignores this; future write gate
    atc_check_variant: "S4HANA_READINESS_2023"
    notes: "Dev box DE1, contact: Basis team <...>"
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml


class ProfileError(Exception):
    """Raised for missing/invalid profiles or credentials."""


@dataclass(frozen=True)
class Profile:
    id: str
    client_name: str
    base_url: str
    sap_client: str
    language: str = "EN"
    release: str = "unknown"
    verify_tls: bool = True
    allow_write: bool = False
    atc_check_variant: str = "DEFAULT"
    # ATC runs on a large object set can take minutes; this is the HTTP read
    # timeout, not a poll interval.
    timeout_seconds: float = 600.0
    notes: str = ""
    # resolved lazily, not serialized
    _user: str = field(default="", repr=False)
    _password: str = field(default="", repr=False)

    @property
    def credentials(self) -> tuple[str, str]:
        if not self._user or not self._password:
            raise ProfileError(
                f"Credentials for profile '{self.id}' not found. Set environment "
                f"variables {self._env_prefix()}_USER and {self._env_prefix()}_PASS."
            )
        return self._user, self._password

    def _env_prefix(self) -> str:
        return "ABAP_MCP_" + self.id.upper().replace("-", "_")


def _profile_dir() -> Path:
    return Path(os.environ.get("ABAP_MCP_PROFILE_DIR", "profiles"))


def load_profiles() -> dict[str, Profile]:
    """Load all *.yaml profiles from the profile directory."""
    directory = _profile_dir()
    if not directory.is_dir():
        raise ProfileError(
            f"Profile directory '{directory}' not found. Set ABAP_MCP_PROFILE_DIR "
            "or create ./profiles with at least one <id>.yaml file."
        )
    profiles: dict[str, Profile] = {}
    for path in sorted(directory.glob("*.yaml")):
        if path.name.startswith("example."):
            continue
        try:
            raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as exc:
            raise ProfileError(
                f"Profile file '{path.name}' is not valid YAML: {exc}"
            ) from exc
        if not isinstance(raw, dict):
            raise ProfileError(
                f"Profile file '{path.name}' must contain a YAML mapping "
                f"(key: value), not a {type(raw).__name__}."
            )
        try:
            pid = str(raw["id"])
            prefix = "ABAP_MCP_" + pid.upper().replace("-", "_")
            profiles[pid] = Profile(
                id=pid,
                client_name=str(raw.get("client_name", pid)),
                base_url=str(raw["base_url"]).rstrip("/"),
                sap_client=str(raw["sap_client"]),
                language=str(raw.get("language", "EN")),
                release=str(raw.get("release", "unknown")),
                verify_tls=bool(raw.get("verify_tls", True)),
                allow_write=bool(raw.get("allow_write", False)),
                atc_check_variant=str(raw.get("atc_check_variant", "DEFAULT")),
                timeout_seconds=float(raw.get("timeout_seconds", 600.0)),
                notes=str(raw.get("notes", "")),
                _user=os.environ.get(f"{prefix}_USER", ""),
                _password=os.environ.get(f"{prefix}_PASS", ""),
            )
        except KeyError as exc:
            raise ProfileError(
                f"Profile file '{path.name}' is missing required key {exc}. "
                "Required: id, base_url, sap_client."
            ) from exc
        except (TypeError, ValueError) as exc:
            # e.g. timeout_seconds: fast — must surface as a ProfileError so the
            # MCP tools return a readable message instead of a raw traceback.
            raise ProfileError(
                f"Profile file '{path.name}' has a value of the wrong type: {exc}"
            ) from exc
    if not profiles:
        raise ProfileError(f"No profiles found in '{directory}'.")
    return profiles


def get_profile(profile_id: str) -> Profile:
    profiles = load_profiles()
    if profile_id not in profiles:
        available = ", ".join(sorted(profiles))
        raise ProfileError(
            f"Unknown profile '{profile_id}'. Available profiles: {available}. "
            "Use abap_list_profiles to inspect them."
        )
    return profiles[profile_id]
