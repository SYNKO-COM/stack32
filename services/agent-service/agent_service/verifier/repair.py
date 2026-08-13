"""Unified repair-loop policy (M7).

A single, pure controller that governs verify → classify → repair → reverify:

- Only ``BUILDER_REPAIRABLE`` failures are auto-repaired.
- ``USER_ACTION_REQUIRED`` stops immediately (surface to the user, never loop).
- ``PROVIDER_TEMPORARY`` gets a small bounded number of retries (no code change),
  then stops as unresolved.
- Target 3–5 repair iterations, hard maximum 10.
- Fingerprint early-stop: if the same failure fingerprint recurs without progress,
  stop to avoid burning iterations on a loop.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from agent_service.verifier.classify import FailureCategory


@dataclass(frozen=True)
class RepairDecision:
    action: str  # "repair" | "retry" | "stop"
    reason: str
    iteration: int


@dataclass
class RepairLoopController:
    target_iterations: int = 5
    hard_max: int = 10
    max_provider_retries: int = 3
    max_identical_fingerprints: int = 2

    _iteration: int = 0
    _provider_retries: int = 0
    _fingerprint_counts: dict[str, int] = field(default_factory=dict)

    @property
    def iteration(self) -> int:
        return self._iteration

    def decide(
        self,
        *,
        category: FailureCategory,
        fingerprint: str | None = None,
        made_progress: bool = False,
    ) -> RepairDecision:
        """Decide the next step after a verification failure.

        ``made_progress`` signals that the previous repair changed the failure
        (different tests failing, fewer errors); it resets fingerprint stall
        counting so genuine forward progress is not penalized.
        """
        if category == "USER_ACTION_REQUIRED":
            return RepairDecision(
                action="stop",
                reason="USER_ACTION_REQUIRED",
                iteration=self._iteration,
            )

        if self._iteration >= self.hard_max:
            return RepairDecision(
                action="stop",
                reason="HARD_MAX_ITERATIONS_REACHED",
                iteration=self._iteration,
            )

        if category == "PROVIDER_TEMPORARY":
            if self._provider_retries >= self.max_provider_retries:
                return RepairDecision(
                    action="stop",
                    reason="PROVIDER_RETRIES_EXHAUSTED",
                    iteration=self._iteration,
                )
            self._provider_retries += 1
            self._iteration += 1
            return RepairDecision(
                action="retry",
                reason="PROVIDER_TEMPORARY_RETRY",
                iteration=self._iteration,
            )

        # BUILDER_REPAIRABLE path.
        if fingerprint is not None:
            if made_progress:
                # Forward progress: forget prior stall history for this fingerprint.
                self._fingerprint_counts.pop(fingerprint, None)
            count = self._fingerprint_counts.get(fingerprint, 0) + 1
            self._fingerprint_counts[fingerprint] = count
            if not made_progress and count >= self.max_identical_fingerprints:
                return RepairDecision(
                    action="stop",
                    reason="REPEATED_FINGERPRINT_NO_PROGRESS",
                    iteration=self._iteration,
                )

        self._iteration += 1
        return RepairDecision(
            action="repair",
            reason="BUILDER_REPAIR",
            iteration=self._iteration,
        )

    def reached_target(self) -> bool:
        return self._iteration >= self.target_iterations
