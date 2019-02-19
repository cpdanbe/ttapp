require('dotenv').config();
const MongoClient = require('mongodb').MongoClient;
const axios = require('axios');
const YammerAPIClient = require('yammer-rest-api-client');
const client = new YammerAPIClient({token: process.env.YAMMER_AUTH_TOKEN});
const striptags = require('striptags');

async function main() {
    const client = await MongoClient.connect(process.env.DB_CONNECTIONSTRING, {useNewUrlParser: true});
    const db = client.db('ttapp');
    const accounts = await db.collection('accounts').find({}).toArray();

    console.log(`Accounts: ${accounts.length}`);

    for (let i = 0; i < accounts.length; i++) {

        const account = accounts[i];

        const accountId = account['_id'];
        const storedJobs = await db.collection('jobs').find({'accountId': accountId}).toArray();
        console.log(`Stored jobs ${storedJobs.length}`);

        try {
            const jobs = await getAccountJobs(account.apiKey);
            console.log(`Jobs in feed: ${jobs.length}`);

            for (let j = 0; j < jobs.length; j++) {
                console.log('* ...');
                const job = jobs[j];
                const existingJob = storedJobs.find(function (element) {
                    return element.id === job.id;
                });
                console.log(`Create Job ${job.id}: ${existingJob ? 'NO' : 'YES'}`);
                if (!existingJob) {
                    // append accountId
                    job.accountId = accountId;
                    job.postedToYammer = false;
                    const createdJob = await db.collection('jobs').insertOne(job);
                    console.log(`created job with id ${createdJob.insertedId}`);
                }
            }

            const jobsToPost = await db.collection('jobs').find({
                "accountId": accountId,
                "postedToYammer": false
            }).toArray();

            console.log(`Jobs to post: ${jobsToPost.length}`);

            for (let i = 0; i < jobsToPost.length; i++) {
                const job = jobsToPost[i];
                console.log(`About to post job ${job.id} to Yammer`);
                postToYammer(job, account.name)
                    .then(o => {
                        console.log(`Job successfully posted.`)
                    })
                    .catch(err => {
                        console.error(err);
                    })
            }
        } catch (e) {
            console.error(e.message);
        }
        console.log(account);

    }

    await client.close();
}

async function postToYammer(job, accountName) {

    return new Promise((resolve, reject) => {
        console.log('Posting message from ' + accountName);
        const body = striptags(job.attributes.body);

        const abstract = body.substr(0, Math.min(50, body.length));

        const picture = job.attributes.picture;

        const parameters = {
            body: `New job posted by ${accountName} - ${job.attributes.title} - Read all about it right here: ${job.links['careersite-job-url']}.`,
            og_url: job.links['careersite-job-url'],
            og_title: job.attributes.title,
            og_description: abstract,
        };

        if (picture) {
            parameters.og_image: picture.thumb
        }

        client.messages.create(parameters, (error, data) => {
            if (error) {
                console.log('\x1b[31m%s\x1b[0m', 'ERROR OCCURRED');
                console.error(error);
                console.log('\x1b[31m%s\x1b[0m', 'END ERROR OCCURRED');
                throw error;

                reject(error);
            }
            resolve(data);
        });
    });
}

async function getAccountJobs(apiKey) {
    const headers = {
        'Authorization': 'Token token=ci4U-k0GCxLNZhWFLiI74XOVJXEzD_iRuLozdh2H',
        'X-Api-Version': '20161108',
        'Accept': 'application/vnd.api+json'
    };

    const response = await axios('https://api.teamtailor.com/v1/jobs', {headers});
    return response.data.data;
}

main();