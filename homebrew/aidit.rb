class Aidit < Formula
  desc "Local web dashboard for managing AI agent MCP configs and skills"
  homepage "https://github.com/onur/aidit"
  url "https://github.com/onur/aidit/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE_WITH_ACTUAL_SHA256_AT_RELEASE_TIME"
  license "MIT"

  depends_on "node@20"
  depends_on "pnpm" => :build

  def install
    system "pnpm", "install"
    system "pnpm", "build"

    libexec.install Dir["packages/backend/dist/*"]
    libexec.install Dir["packages/frontend/dist/*"]
    libexec.install "bin"
    libexec.install "package.json"

    (bin/"aidit").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node@20"].opt_bin}/node" "#{libexec}/bin/aidit.js" "$@"
    EOS
  end

  test do
    assert_match "aidit v#{version}", shell_output("#{bin}/aidit --version")
  end
end
