// NOTE: this CAN be converted to a single huge unmaintainable regex. Leaving like this for readability. 
export const UNTRUSTED_INPUT = [
  // Workflows.
  /github\.event\.issue\.title/,
  /github\.event\.issue\.body/,
  /github\.event\.pull_request\.title/,
  /github\.event\.pull_request\.body/,
  /github\.event\.comment\.body/,
  /github\.event\.review\.body/,
  /github\.event\.pages\.[\w.-]*\.page_name/,
  /github\.event\.commits\.[\w.-]*\.message/,
  /github\.event\.head_commit\.message/,
  /github\.event\.head_commit\.author\.email/,
  /github\.event\.head_commit\.author\.name/,
  /github\.event\.commits\.[\w.-]*\.author\.email/,
  /github\.event\.commits\.[\w.-]*\.author\.name/,
  /github\.event\.pull_request\.head\.ref/,
  /github\.event\.pull_request\.head\.label/,
  /github\.event\.pull_request\.head\.repo\.default_branch/,
  /github\.event\.workflow_run\.head_branch/,
  /github\.event\.workflow_run\.head_commit\.message/,
  /github\.event\.workflow_run\.head_commit\.author\.email/,
  /github\.event\.workflow_run\.head_commit\.author\.name/,
  /github\.head_ref/,
  // Actions.
  /inputs\.[\w.-]*/,
];

export const ARTIFACT_DOWNLOAD_ACTIONS = [
  'actions/download-artifact',
  'dawidd6/action-download-artifact',
  'aochmann/actions-download-artifact',
  'levonet/action-download-last-artifact',
  'ishworkh/docker-image-artifact-download',
  'ishworkh/container-image-artifact-download',
  'marcofaggian/action-download-multiple-artifacts',
];

export const ARTIFACT_DOWNLOAD_API = [
  'downloadArtifact',
  'getArtifact',
];

export const ARTIFACT_UPLOAD_ACTIONS = [
  'actions/upload-artifact',
  'ishworkh/docker-image-artifact-upload',
  'ishworkh/container-image-artifact-upload',
]

export const CWD_COMPROMISABLE_RULES = [
  { uses: new RegExp("nick-invision/retry"), with: { command: new RegExp("^make\\s") } },

  { run: new RegExp("(?<line>npm i(nstall)?.*)$", "m") },
  { run: new RegExp("(?<line>make\\s.*)$", "m") },
  { run: new RegExp("(?<line>poetry install.*)$", "m") },
  { run: new RegExp("(?<line>poetry run.*)$", "m") },

  { run: new RegExp("[&|;]\\s*(?<line>[.]/.*)$", "m") },
]

export const SECRET_RULES = [
  { with: { "*": new RegExp("\\${{\\s+(?<secret>secrets[.].*?)\\s}}") } },
  { env: { "*": new RegExp("\\${{\\s+(?<secret>secrets[.].*?)\\s}}") } },
]
