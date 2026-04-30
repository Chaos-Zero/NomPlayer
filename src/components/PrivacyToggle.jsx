import React, { useState } from 'react';

export default function PrivacyToggle({ isPublic, onToggle, disabled }) {
  const [loading, setLoading] = useState(false);

  async function handleToggle(e) {
    e.stopPropagation();
    if (disabled || loading) return;
    setLoading(true);
    try {
      await onToggle(!isPublic);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className={`privacy-toggle ${isPublic ? 'is-public' : 'is-private'} ${disabled || loading ? 'disabled' : ''}`}
      onClick={handleToggle}
      title={isPublic ? 'Make Private' : 'Make Public'}
      disabled={disabled || loading}
    >
      <div className="privacy-toggle-track">
        <div className="privacy-toggle-thumb" />
      </div>
      <span className="privacy-toggle-label">
        {isPublic ? 'Public' : 'Private'}
      </span>
    </button>
  );
}
