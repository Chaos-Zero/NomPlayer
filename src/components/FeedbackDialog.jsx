import { useEffect, useRef, useState } from 'react';
import { FeedbackIcon } from './Icons.jsx';

export default function FeedbackDialog({
  compact = false,
  disabled = false,
  user = null,
  profile = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('General Feedback');
  const [feedbackText, setFeedbackText] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle', 'submitting', 'success'
  const [error, setError] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (menuRef.current?.contains(event.target)) return;
      setIsOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const placeholders = {
    'General Feedback':
      'Let us know what you think of the site; the good and the bad',
    'Feature Request':
      'Is there something you want to see on the site? A flow not quite working right? Send us a message',
    Bug: 'Found a bug? Send it on here, please!',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedText = feedbackText.trim();
    if (!trimmedText) return;

    setStatus('submitting');
    setError('');

    try {
      const endpoint = import.meta.env.VITE_FEEDBACK_API_URL;

      // Build Payload
      const payload = {
        type: feedbackType,
        text: trimmedText,
        username: (
          profile?.username ||
          user?.user_metadata?.username ||
          'Anonymous'
        ).replace(/^dc:/, ''),
        url: window.location.href,
        timestamp: new Date().toISOString(),
      };

      if (!endpoint) {
        console.warn(
          'VITE_FEEDBACK_API_URL not configured. Simulating success.',
          payload,
        );
        await new Promise((resolve) => setTimeout(resolve, 800));
        setStatus('success');
        setFeedbackText('');
        return;
      }

      const authSecret = import.meta.env.VITE_FEEDBACK_API_SECRET;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authSecret ? { Authorization: `Bearer ${authSecret}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Submission failed: ${response.statusText}`);
      }

      setStatus('success');
      setFeedbackText('');
    } catch (err) {
      console.error('Feedback submission error:', err);
      setError('Failed to send feedback. Please try again.');
      setStatus('idle');
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (status === 'success') {
      setStatus('idle');
    }
    setError('');
  };

  return (
    <div
      ref={menuRef}
      className={`user-menu feedback-menu${compact ? ' compact' : ''}${isOpen ? ' open' : ''}`}
    >
      <button
        className={`collection-toggle-btn feedback-toggle-btn${isOpen ? ' active' : ''}`}
        type="button"
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Submit anonymous feedback"
        disabled={disabled}
        title="Feedback"
      >
        <FeedbackIcon />
      </button>

      {isOpen && (
        <div className="user-menu-popover feedback-popover" role="dialog">
          {status === 'success' ? (
            <div className="feedback-success-message">
              <p>Thank you for your feedback!</p>
              <button
                className="btn btn-primary"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>
          ) : (
            <form className="feedback-form" onSubmit={handleSubmit}>
              <div className="feedback-form-group">
                <label htmlFor="feedback-type">Leave Feedback</label>
                <select
                  id="feedback-type"
                  value={feedbackType}
                  onChange={(e) => setFeedbackType(e.target.value)}
                  className="feedback-select"
                >
                  <option value="General Feedback">General Feedback</option>
                  <option value="Feature Request">Feature Request</option>
                  <option value="Bug">Bug</option>
                </select>
              </div>

              <div className="feedback-form-group">
                <textarea
                  className="feedback-textarea"
                  placeholder={placeholders[feedbackType]}
                  value={feedbackText}
                  onChange={(e) => {
                    setFeedbackText(e.target.value);
                    if (error) setError('');
                  }}
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div
                  className="feedback-error-message"
                  style={{
                    color: 'var(--danger)',
                    fontSize: '12px',
                    marginTop: '-8px',
                  }}
                >
                  {error}
                </div>
              )}

              <div className="feedback-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={status === 'submitting' || !feedbackText.trim()}
                >
                  {status === 'submitting' ? 'Sending...' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
