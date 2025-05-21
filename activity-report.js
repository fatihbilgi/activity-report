const axios = require('axios');
const dayjs = require('dayjs');
const isoWeek = require('dayjs/plugin/isoWeek');
require('dotenv').config();

async function fetchDeals() {
    const deals = [];
    let start = 0;

    dayjs.extend(isoWeek);
    const lastWeekStart = dayjs().subtract(1, 'week').startOf('isoWeek').format('YYYY-MM-DDTHH:mm:ss');
    const lastWeekEnd = dayjs().subtract(1, 'week').endOf('isoWeek').format('YYYY-MM-DDTHH:mm:ss');

    while (true) {
        const response = await axios.get(`${process.env.BITRIX_URL}/crm.deal.list`, {
            params: {
                filter: {
                    //"ID": 149751,
                    "STAGE_ID": ["NEW", "4", "UC_SXWMDD"],
                    ">=DATE_CREATE": lastWeekStart,
                    "<=DATE_CREATE": lastWeekEnd
                },
                order: { "DATE_CREATE": "DESC" },
                start: start
            }
        });

        const result = response.data.result;
        if (!result.length) break;

        deals.push(...result);
        if (response.data.next !== undefined) {
            start = response.data.next;
        } else {
            break;
        }
    }

    return deals;
}

async function fetchActivities(dealId) {
    let start = 0;
    const activities = [];

    while (activities.length < 3) {
        const response = await axios.get(`${process.env.BITRIX_URL}/crm.activity.list`, {
            params: {
                filter: {
                    "OWNER_ID": dealId,
                    "OWNER_TYPE_ID": 2,
                    "COMPLETED": "Y",
                    "PROVIDER_ID": "CRM_TODO"
                },
                order: { "CREATED": "ASC" },
                start: start
            }
        });

        const result = response.data.result;
        if (!result || result.length === 0) break;

        activities.push(...result);

        if (response.data.next !== undefined) {
            start = response.data.next;
        } else {
            break;
        }
    }

    return activities.slice(0, 3);
}

async function updateDeals(dealId, first, second, third) {
    try {
        await axios.post(`${process.env.BITRIX_URL}/crm.deal.update`, {
            ID: dealId,
            FIELDS: {
                UF_CRM_1747742892: first,
                UF_CRM_1747761003: second,
                UF_CRM_1747761025: third
            }
        });
    } catch (error) {
        console.error(`Failed to update deal ${dealId}:`, error.response?.data || error.message);
    }
}

async function calculateResponseTimes() {
    var total = 0;
    const deals = await fetchDeals();

    for (const deal of deals) {
        const dealCreated = dayjs(deal.DATE_CREATE);
        const activities = await fetchActivities(deal.ID);

        if (activities.length > 0 && activities[0].LAST_UPDATED) {
            const first = dayjs(activities[0].LAST_UPDATED).diff(dealCreated, 'minute');
            const second = activities[1] && activities[1].LAST_UPDATED
                ? dayjs(activities[1].LAST_UPDATED).diff(dayjs(activities[0].LAST_UPDATED), 'minute')
                : null;
            const third = activities[2] && activities[2].LAST_UPDATED
                ? dayjs(activities[2].LAST_UPDATED).diff(dayjs(activities[1].LAST_UPDATED), 'minute')
                : null;


            await updateDeals(deal.ID, first, second, third);
            total++;
        }
    }

    console.log(`${total} follow up times saved.`);
}

calculateResponseTimes();
