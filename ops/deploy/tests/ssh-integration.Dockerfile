# Vancine SSH integration test Dockerfile.
# Builds a real Ubuntu + OpenSSH environment for testing the installer and
# gateway under actual Linux/GNU stat and sshd semantics.
#
# IMPORTANT: No private keys are generated or COPYed into the image.
# The test key is generated at runtime by the entrypoint so that no
# private key material exists in any image layer.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install OpenSSH server, sudo, and tools the installer requires.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server \
      sudo \
      openssh-client \
      coreutils \
      passwd \
      util-linux \
      wget \
      git \
      python3 \
    && apt-get clean

# Create the SSH run directory.
RUN mkdir -p /run/sshd

# Configure sshd for public-key-only authentication with StrictModes.
RUN sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config \
    && sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's/^#\?StrictModes.*/StrictModes yes/' /etc/ssh/sshd_config \
    && sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config

# Copy the real installer scripts from the repository into the image.
COPY ops/deploy/install-production-access.sh /tmp/installer.sh
COPY ops/deploy/production-deploy.sh /tmp/production-deploy.sh
COPY ops/deploy/ssh-command-gateway.sh /tmp/ssh-command-gateway.sh
RUN chmod 755 /tmp/installer.sh /tmp/production-deploy.sh /tmp/ssh-command-gateway.sh

# Copy the entrypoint that starts sshd, generates a unique test key, and
# runs the real installer. No private key exists in the image layers.
COPY ops/deploy/tests/ssh-integration-entrypoint.sh /tmp/entrypoint.sh
RUN chmod +x /tmp/entrypoint.sh

EXPOSE 22

ENTRYPOINT ["/tmp/entrypoint.sh"]
