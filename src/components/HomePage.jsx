const HOME_PANES = [
  {
    title: 'Discover',
    eyebrow: 'Placeholder',
    description:
      'Surface featured playlists, staff picks, and fresh soundtrack finds here.',
    tone: 'discover',
  },
  {
    title: 'Manage Lists',
    eyebrow: 'Placeholder',
    description:
      'Give support, nominations, and curated collections a dedicated control hub.',
    tone: 'manage',
  },
  {
    title: 'Listen Now',
    eyebrow: 'Placeholder',
    description:
      'Highlight active sessions, quick-start mixes, and current listening queues.',
    tone: 'listen',
  },
  {
    title: 'VGMC Updates',
    eyebrow: 'Placeholder',
    description:
      'Reserve this space for announcements, events, and recently added tracks.',
    tone: 'updates',
  },
];

export default function HomePage() {
  return (
    <div className="home-shell">
      <div className="home-grid">
        {HOME_PANES.map((pane) => (
          <section
            key={pane.title}
            className={`home-pane home-pane-${pane.tone}`}
            aria-label={pane.title}
          >
            <span className="home-pane-eyebrow">{pane.eyebrow}</span>
            <h2 className="home-pane-title">{pane.title}</h2>
            <p className="home-pane-copy">{pane.description}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
