// Popup: thin UI over the background script. No Supabase calls happen here directly,
// everything goes through browser.runtime.sendMessage so the session lives in one
// place (background.js / browser.storage.local).
const signedOutView = document.getElementById('signed-out-view');
const signedInView = document.getElementById('signed-in-view');
const errorEl = document.getElementById('error');
const accountEl = document.getElementById('account');
const statusEl = document.getElementById('status');
const topicsListEl = document.getElementById('topics-list');
const topicsHintEl = document.getElementById('topics-hint');

function describeStatus(status) {
  switch (status.state) {
    case 'synced':
      return `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}, ${status.lastAcceptedPosts} post(s) accepted, playlist has ${status.lastPlaylistSize} track(s).`;
    case 'signed_out':
      return status.message || 'Signed out.';
    case 'update_required':
      return `Update needed: ${status.message}`;
    case 'error':
      return `Error: ${status.message}`;
    default:
      return 'Waiting for the nomination thread to sync…';
  }
}

async function renderFollowedTopics() {
  const topics = await browser.runtime.sendMessage({
    type: 'VGMC_GET_FOLLOWED_TOPICS',
  });

  topicsListEl.innerHTML = '';
  topicsHintEl.hidden = topics.length > 0;

  for (const topic of topics) {
    const item = document.createElement('li');

    const label = document.createElement('span');
    label.textContent = `${topic.gameTitle}, ${topic.topicTitle}`;
    label.title = topic.url;
    item.appendChild(label);

    const removeButton = document.createElement('button');
    removeButton.textContent = '✕';
    removeButton.title = 'Stop following this topic';
    removeButton.addEventListener('click', async () => {
      await browser.runtime.sendMessage({
        type: 'VGMC_REMOVE_FOLLOWED_TOPIC',
        topicId: topic.topicId,
      });
      await renderFollowedTopics();
    });
    item.appendChild(removeButton);

    topicsListEl.appendChild(item);
  }
}

async function render() {
  const session = await browser.runtime.sendMessage({
    type: 'VGMC_GET_SESSION',
  });
  const status = await browser.runtime.sendMessage({ type: 'VGMC_GET_STATUS' });

  if (!session) {
    signedOutView.hidden = false;
    signedInView.hidden = true;
    return;
  }

  signedOutView.hidden = true;
  signedInView.hidden = false;
  accountEl.textContent = `Signed in as ${session.email}`;
  statusEl.textContent = describeStatus(status);
  await renderFollowedTopics();
}

document.getElementById('sign-in').addEventListener('click', async () => {
  errorEl.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    errorEl.textContent = 'Enter your email and password.';
    return;
  }

  const result = await browser.runtime.sendMessage({
    type: 'VGMC_SIGN_IN',
    email,
    password,
  });

  if (!result.ok) {
    errorEl.textContent = result.error || 'Sign-in failed.';
    return;
  }

  await render();
});

document.getElementById('sign-out').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'VGMC_SIGN_OUT' });
  await render();
});

document.getElementById('sync-now').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'VGMC_SYNC_NOW' });
  setTimeout(render, 1500);
});

document
  .getElementById('track-active-tab')
  .addEventListener('click', async () => {
    await browser.runtime.sendMessage({ type: 'VGMC_TRACK_ACTIVE_TAB' });
    setTimeout(render, 500);
  });

render();
