"use client";

import { useState } from "react";

interface FollowPresenterToggleProps {
  assessmentId: string;
  sessionId: string;
  initialFollowing: boolean;
}

export function FollowPresenterToggle({
  assessmentId,
  sessionId,
  initialFollowing,
}: FollowPresenterToggleProps) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [updating, setUpdating] = useState(false);

  const handleToggle = async () => {
    const newValue = !isFollowing;
    setUpdating(true);
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/workshops/${sessionId}/attendees/follow`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isFollowing: newValue }),
        },
      );
      if (res.ok) {
        setIsFollowing(newValue);
      }
    } finally {
      setUpdating(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={updating}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        isFollowing
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${isFollowing ? "bg-green-500" : "bg-gray-400"}`} />
      {isFollowing ? "Following presenter" : "Browsing independently"}
    </button>
  );
}
