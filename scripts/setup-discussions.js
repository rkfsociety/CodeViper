/**
 * Создаёт закреплённое обсуждение «Правила и куда писать» (идемпотентно).
 * Запуск из корня репозитория: node scripts/setup-discussions.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_OWNER = 'rkfsociety';
const REPO_NAME = 'CodeViper';
const WELCOME_TITLE = '📌 Правила и куда писать';
const WELCOME_CATEGORY_SLUG = 'announcements';

function ghGraphql(query, variables = {}) {
  const payload = JSON.stringify({ query, variables });
  const tmp = path.join(__dirname, '.setup-discussions-payload.json');
  fs.writeFileSync(tmp, payload, 'utf8');
  try {
    const out = execFileSync('gh', ['api', 'graphql', '--input', tmp], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out);
    if (parsed.errors?.length) {
      throw new Error(parsed.errors.map((e) => e.message).join('; '));
    }
    return parsed.data;
  } finally {
    fs.unlinkSync(tmp);
  }
}

function main() {
  const bodyPath = path.join(__dirname, '..', '.github', 'discussions', 'welcome.md');
  const body = fs.readFileSync(bodyPath, 'utf8');

  const meta = ghGraphql(
    `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        id
        discussionCategories(first: 20) { nodes { id slug name } }
        discussions(first: 50) { nodes { id title number url } }
        pinnedDiscussions(first: 5) {
          nodes { discussion { id title number } }
        }
      }
    }`,
    { owner: REPO_OWNER, name: REPO_NAME },
  );

  const repo = meta.repository;
  const category = repo.discussionCategories.nodes.find((c) => c.slug === WELCOME_CATEGORY_SLUG);
  if (!category) {
    throw new Error(`Категория ${WELCOME_CATEGORY_SLUG} не найдена`);
  }

  let discussion = repo.discussions.nodes.find((d) => d.title === WELCOME_TITLE);
  if (!discussion) {
    const created = ghGraphql(
      `mutation($repo: ID!, $cat: ID!, $title: String!, $body: String!) {
        createDiscussion(input: { repositoryId: $repo, categoryId: $cat, title: $title, body: $body }) {
          discussion { id title number url }
        }
      }`,
      {
        repo: repo.id,
        cat: category.id,
        title: WELCOME_TITLE,
        body,
      },
    );
    discussion = created.createDiscussion.discussion;
    console.log(`Создано обсуждение #${discussion.number}: ${discussion.url}`);
  } else {
    ghGraphql(
      `mutation($id: ID!, $body: String!) {
        updateDiscussion(input: { discussionId: $id, body: $body }) {
          discussion { id url }
        }
      }`,
      { id: discussion.id, body },
    );
    console.log(`Обновлено обсуждение #${discussion.number}: ${discussion.url}`);
  }

  const alreadyPinned = repo.pinnedDiscussions.nodes.some(
    (p) => p.discussion.id === discussion.id,
  );
  if (!alreadyPinned) {
    try {
      ghGraphql(
        `mutation($id: ID!) {
          pinDiscussion(input: { discussionId: $id }) { clientMutationId }
        }`,
        { id: discussion.id },
      );
      console.log('Обсуждение закреплено');
    } catch (err) {
      console.warn(
        `Не удалось закрепить через API (${err.message}). Закрепите вручную: ${discussion.url} → Pin discussion`,
      );
    }
  } else {
    console.log('Обсуждение уже закреплено');
  }

  console.log(`\nСсылка для README: ${discussion.url}`);
}

main();
