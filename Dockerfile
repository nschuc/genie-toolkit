FROM node:15-stretch
# to put at the end, to enable ssh and port forwarding
USER root
EXPOSE 2222
EXPOSE 6000
EXPOSE 8088
ENV LANG=en_US.UTF-8
RUN apt update && \
    apt install -y \
        zip unzip gettext \
        ca-certificates supervisor openssh-server bash ssh \
        curl wget vim procps htop locales nano man net-tools iputils-ping && \
    sed -i "s/# en_US.UTF-8/en_US.UTF-8/" /etc/locale.gen && \
    locale-gen && \
    useradd -m -u 13011 -s /bin/bash toolkit && \
    passwd -d toolkit && \
    useradd -m -u 13011 -s /bin/bash --non-unique console && \
    passwd -d console && \
    useradd -m -u 13011 -s /bin/bash --non-unique _toolchain && \
    passwd -d _toolchain && \
    useradd -m -u 13011 -s /bin/bash --non-unique coder && \
    passwd -d coder && \
    chown -R toolkit:toolkit /run /etc/shadow /etc/profile && \
    apt autoremove --purge && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    echo ssh >> /etc/securetty && \
    rm -f /etc/legal /etc/motd

WORKDIR /usr/app

RUN npm install -g npm@7.5.2 node-pre-gyp thingpedia-cli

COPY --chown=13011:13011 --from=registry.console.elementai.com/shared.image/sshd:base /tk /tk
RUN chmod 0600 /tk/etc/ssh/ssh_host_rsa_key
ENTRYPOINT ["/tk/bin/start.sh"]
