import { Devvit, Header, KeyValueStorage, RedditAPIClient, getFromMetadata } from '@devvit/public-api';
import { CommentSubmit, PostSubmit, Metadata } from '@devvit/protos'
// Visit developers.reddit.com/docs to view documentation for the Devvit api

const kvstore = new KeyValueStorage(Devvit.use(Devvit.Types.KVStore));
const reddit = new RedditAPIClient();

const luck = 0.99;
const widgetName = "luckyboards";

interface Counts {
    [username: string]: number;
}

async function incrementCount(username: string, m?: Metadata) {
    let scores = await kvstore.get<Counts>("scores", m, {});

    if(username in scores!) {
        scores![username] += 1;
    } else {
        scores![username] = 1;
    }

    await kvstore.put("scores", scores!, m);
}

async function generateLeaderboard(m?: Metadata): Promise<string> {
    let scores = await kvstore.get<Counts>("scores", m, {});

    let sortedScores = Object.entries(scores!).sort((a: [string, number], b: [string, number]) => {
        return b[1] - a[1];
    }).slice(0, 10);

    const header = "||Username|Score|";
    const alignment = "|:--|:--|--:|";
    const body = sortedScores.map((e, index) => {
        return `|${index+1}|${e[0]}|${e[1]}|`;
    }).join("\n");

    return [header, alignment, body].join("\n");
}

async function updateLeaderboard(subreddit: string, m?: Metadata) {
    let widgets = await reddit.getWidgets(subreddit, m);

    await Promise.all(widgets.filter(w => {
        return w.name === widgetName;
    }).map(async w => {
        return w.delete();
    }));

    await reddit.addWidget({
        type: "textarea",
        shortName: widgetName,
        subreddit,
        text: await generateLeaderboard(),
        styles: {
            backgroundColor: "#ff66ac",
            headerColor: "#5a74cc",
        },
    }, m);
}

async function handleSubmission(username: string, subreddit: string, parentId: string, m?: Metadata) {
    // Increment counter for user
    await incrementCount(username, m);
    
    // Roll luck
    const roll = Math.random();

    // Ban if unlucky
    if(roll > luck) {
        // Ban 'em
        await reddit.banUser({
            username,
            subredditName: subreddit,
            message: "Unlucky. :("
        }, m);

        await reddit.submitComment({
            id: parentId,
            text: "User was banned for being unlucky when submitting this.",
        }, m);
    }

    // Update leaderboard
    await updateLeaderboard(subreddit, m);
}

Devvit.onCommentSubmit(async (args: CommentSubmit, metadata?: Metadata) => {
    if(args.author!.id !== getFromMetadata(Header.AppUser, metadata)) {
        await handleSubmission(args.author!.name, args.subreddit!.name, args.comment!.id, metadata);
    }
    
    return {};
});

Devvit.onPostSubmit(async (args: PostSubmit, metadata?: Metadata) => {
    if(args.author!.id !== getFromMetadata(Header.AppUser, metadata)) {
        await handleSubmission(args.author!.name, args.subreddit!.name, args.post!.id, metadata);
    }
    
    return {};
});

export default Devvit;
