"""Profile registry helpers for the API server."""

from pathlib import Path
from typing import Any, Dict, List


class ProfileRegistry:
    """Expose profile management with JSON-friendly return values."""

    def __init__(self) -> None:
        from hermes_cli.profiles import get_active_profile

        self._get_active_profile = get_active_profile

    def list_profiles(self) -> List[Dict[str, Any]]:
        from hermes_cli.profiles import list_profiles

        sticky_default = self._get_active_profile()
        profiles = []
        for info in list_profiles():
            profiles.append({
                "id": info.name,
                "name": info.name,
                "path": str(info.path),
                "isDefault": info.is_default,
                "gatewayRunning": info.gateway_running,
                "model": info.model,
                "provider": info.provider,
                "hasEnv": info.has_env,
                "skillCount": info.skill_count,
                "aliasPath": str(info.alias_path) if info.alias_path else None,
                "stickyDefault": info.name == sticky_default,
            })
        return profiles

    def get_profile_home(self, profile_id: str) -> Path:
        from hermes_cli.profiles import get_profile_dir, profile_exists, validate_profile_name

        validate_profile_name(profile_id)
        if not profile_exists(profile_id):
            raise FileNotFoundError(
                f"Profile '{profile_id}' does not exist. "
                f"Create it with: hermes profile create {profile_id}"
            )
        return get_profile_dir(profile_id)

    def create_profile(
        self,
        *,
        name: str,
        clone_from: str | None = None,
        clone_all: bool = False,
        clone_config: bool = False,
    ) -> Dict[str, Any]:
        from hermes_cli.profiles import create_profile, get_profile_dir, seed_profile_skills

        profile_dir = create_profile(
            name=name,
            clone_from=clone_from,
            clone_all=clone_all,
            clone_config=clone_config,
            no_alias=True,
        )
        skills_seeded = None
        if not clone_all:
            result = seed_profile_skills(profile_dir, quiet=True)
            if result:
                skills_seeded = {
                    "copied": len(result.get("copied", [])),
                    "updated": len(result.get("updated", [])),
                    "userModified": len(result.get("user_modified", [])),
                }

        return {
            "id": name,
            "path": str(get_profile_dir(name)),
            "skillsSeeded": skills_seeded,
        }

    def set_sticky_default(self, profile_id: str) -> None:
        from hermes_cli.profiles import set_active_profile

        set_active_profile(profile_id)
