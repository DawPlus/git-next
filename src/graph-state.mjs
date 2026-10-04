export function layoutGraph(commits) {
  const lanes = [];

  return commits.map((commit) => {
    let lane = lanes.indexOf(commit.id);

    if (lane === -1) {
      lane = lanes.findIndex((entry) => entry === null);

      if (lane === -1) {
        lane = lanes.length;
      }

      lanes[lane] = commit.id;
    }

    lanes[lane] = null;

    const parentLanes = commit.parents.map((parent, index) => {
      const existingLane = lanes.indexOf(parent);

      if (existingLane !== -1) {
        return existingLane;
      }

      if (index === 0 && lanes[lane] === null) {
        lanes[lane] = parent;
        return lane;
      }

      let parentLane = lanes.findIndex((entry, candidate) => candidate > lane && entry === null);

      if (parentLane === -1) {
        parentLane = lanes.length;
      }

      lanes[parentLane] = parent;
      return parentLane;
    });

    while (lanes.at(-1) === null) {
      lanes.pop();
    }

    return {
      ...commit,
      lane,
      parentLanes,
    };
  });
}


export function filterGraphState(state, options = {}) {
  if (state.kind !== "repository") {
    return state;
  }

  const scope = options.scope ?? "all";
  const focus = options.focus ?? "all";
  const selectedRef = options.ref ?? "";
  const query = String(options.query ?? "").trim().toLowerCase();
  const limit = Math.max(1, Number(options.limit ?? 50));
  const commitMap = new Map(state.commits.map((commit) => [commit.id, commit]));
  let allowed = new Set(state.commits.map((commit) => commit.id));

  if (selectedRef) {
    const ref = state.refs.find((item) => item.fullName === selectedRef || item.name === selectedRef);
    if (ref) {
      const ancestry = new Set();
      const stack = [ref.target];
      while (stack.length) {
        const id = stack.pop();
        if (!id || ancestry.has(id)) continue;
        ancestry.add(id);
        const commit = commitMap.get(id);
        if (commit) stack.push(...commit.parents);
      }
      allowed = ancestry;
    }
  }

  if (query) {
    const matched = state.commits.filter((commit) =>
      [commit.id, commit.message, commit.author]
        .some((value) => String(value ?? "").toLowerCase().includes(query)),
    );
    const withAncestors = new Set();
    const stack = matched.map((commit) => commit.id);
    while (stack.length) {
      const id = stack.pop();
      if (!id || withAncestors.has(id)) continue;
      withAncestors.add(id);
      const commit = commitMap.get(id);
      if (commit) stack.push(...commit.parents);
    }
    allowed = new Set([...allowed].filter((id) => withAncestors.has(id)));
  }

  const refs = state.refs.filter((ref) => {
    if (scope === "local") return ref.kind === "local";
    if (scope === "remote") return ref.kind === "remote";
    if (scope === "tag") return ref.kind === "tag";
    return true;
  });

  const upstream = state.refs.find((ref) => ref.kind === "remote" && (ref.name === state.upstream || ref.fullName === state.upstream));
  const local = state.refs.find((ref) => ref.kind === "local" && (ref.name === state.branch || ref.fullName === `refs/heads/${state.branch}`));
  const ancestors = (target) => {
    const found = new Set();
    const stack = [target];
    while (stack.length) {
      const id = stack.pop();
      if (!id || found.has(id)) continue;
      found.add(id);
      const commit = commitMap.get(id);
      if (commit) stack.push(...commit.parents);
    }
    return found;
  };
  const localHistory = ancestors(state.head ?? local?.target);
  const remoteHistory = ancestors(upstream?.target);
  const outgoing = new Set([...localHistory].filter((id) => !remoteHistory.has(id)));
  const incoming = new Set([...remoteHistory].filter((id) => !localHistory.has(id)));
  let focused = new Set();
  if (upstream && focus === "push") focused = outgoing;
  if (upstream && focus === "pull") focused = incoming;
  if (upstream && focus === "diverged" && outgoing.size && incoming.size) focused = new Set([...outgoing, ...incoming]);
  if (focus === "merge-base" && options.focusCommitId) focused = new Set([options.focusCommitId]);
  if (focus === "selected-commit" && options.focusCommitId) focused = new Set([options.focusCommitId]);
  if (focus === "file-history") focused = new Set(options.focusCommitIds ?? []);
  if (focus === "tags") focused = new Set(state.refs.filter((ref) => ref.kind === "tag").map((ref) => ref.target));
  const commits = state.commits.filter((commit) => allowed.has(commit.id)).slice(0, limit)
    .map((commit) => ({ ...commit, isFocused: focused.has(commit.id), isMuted: focus !== "all" && !focused.has(commit.id) }));

  return {
    ...state,
    refs,
    commits,
    focusCount: commits.filter((commit) => commit.isFocused).length,
  };
}
