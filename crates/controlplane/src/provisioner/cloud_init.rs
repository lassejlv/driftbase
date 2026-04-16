/// Render the cloud-init `user_data` that installs Docker + the zediz-agent binary
/// and starts it as a systemd unit, passing the bootstrap token and control plane URL.
///
/// The agent binary is fetched from `agent_release_url` at first boot.
pub fn render(
    control_plane_url: &str,
    bootstrap_token: &str,
    agent_release_url: &str,
    node_id: &str,
    workspace_id: &str,
) -> String {
    format!(
        r#"#cloud-config
package_update: true
packages:
  - ca-certificates
  - curl
  - jq
write_files:
  - path: /etc/zediz/agent.env
    owner: root:root
    permissions: '0600'
    content: |
      ZEDIZ_CONTROL_PLANE_URL={control_plane_url}
      ZEDIZ_BOOTSTRAP_TOKEN={bootstrap_token}
      ZEDIZ_NODE_ID={node_id}
      ZEDIZ_WORKSPACE_ID={workspace_id}
  - path: /etc/systemd/system/zediz-agent.service
    owner: root:root
    permissions: '0644'
    content: |
      [Unit]
      Description=Zediz node agent
      After=network-online.target docker.service
      Wants=network-online.target docker.service
      Requires=docker.service

      [Service]
      Type=simple
      EnvironmentFile=/etc/zediz/agent.env
      ExecStart=/usr/local/bin/zediz-agent
      Restart=always
      RestartSec=5s

      [Install]
      WantedBy=multi-user.target
runcmd:
  - curl -fsSL https://get.docker.com | sh
  - curl -fsSL -o /usr/local/bin/zediz-agent {agent_release_url}
  - chmod +x /usr/local/bin/zediz-agent
  - systemctl daemon-reload
  - systemctl enable --now zediz-agent.service
"#
    )
}
