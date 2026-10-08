# Homebrew formula for aidit.
#
# Lives here as a template until it is submitted to a tap. On each release,
# update `url` to the new npm tarball and `sha256` to its checksum:
#   curl -sL https://registry.npmjs.org/aidit/-/aidit-X.Y.Z.tgz | shasum -a 256
class Aidit < Formula
  desc "Local dashboard for managing MCP servers and skills across AI coding agents"
  homepage "https://github.com/onurceri/aidit"
  url "https://registry.npmjs.org/aidit/-/aidit-0.2.0.tgz"
  sha256 "REPLACE_WITH_ACTUAL_SHA256_AT_RELEASE_TIME"
  license "MIT"

  # Requires Node.js >= 22.13 (built-in node:sqlite).
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "aidit v#{version}", shell_output("#{bin}/aidit --version")
  end
end
