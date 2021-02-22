const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const parser = require("xml2json");
const TurndownService = require("turndown");

const turndownService = new TurndownService();

const parse = async (url) => {
  const { data } = await axios.get(url);
  return JSON.parse(await parser.toJson(data));
};

const getLastItem = (rss) => {
  const item = rss.rss.channel.item;
  if (Array.isArray(item)) return item[0];
  return item;
};

(async () => {
  const feedCache = JSON.parse(
    await fs
      .readFile(path.join(__dirname, ".cache.json"), "utf-8")
      .catch(() => "{}") // File does not exist
  );

  const feedConfig = JSON.parse(
    await fs
      .readFile(path.join(__dirname, "feeds.json"), "utf-8")
      .catch(() => "[]") // File does not exist
  );

  const feed = await Promise.all(
    feedConfig.map(async (v) => ({
      ...v,
      data: getLastItem(await parse(v.url)),
    }))
  );

  try {
    await Promise.all(
      feed.map(async (channel) => {
        const date = new Date(channel.data.pubDate);
        if (date.getTime() > (feedCache[channel.url] || 0)) {
          feedCache[channel.url] = date.getTime();

          await axios.post(channel.webhookUrl, {
            content: `Novo anúncio de ${channel.name}!`,
            embeds: [
              {
                title: channel.data.title.substring(0, 256),
                description: turndownService
                  .turndown(channel.data.description)
                  .substring(0, 2048),
                url: channel.data.link,
                color: parseInt(channel.color.substring(1), 16),
                author: {
                  name:
                    channel.data.author.match(/\((.+)\)/)?.[1] ||
                    channel.data.author,
                },
                footer: {
                  text: channel.name,
                },
                timestamp: date.toISOString(),
              },
            ],
          });
        }
      })
    );
  } catch (ignore) {}

  fs.writeFile(
    path.join(__dirname, ".cache.json"),
    JSON.stringify(feedCache),
    "utf-8"
  );
})();
