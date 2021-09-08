### IMDB Scraper

IMDB Scraper is an [Apify actor](https://apify.com/actors) for extracting data about actors from [IMDB](https://www.imdb.com/search/title/). It allows you to extract all movies/TV shows their information. It is build on top of [Apify SDK](https://sdk.apify.com/) and you can run it both on [Apify platform](https://my.apify.com) and locally.

- [Input](#input)
- [Output](#output)
- [Compute units consumption](#compute-units-consumption)
- [Extend output function](#extend-output-function)

### Input

| Field | Type | Description | Default value
| ----- | ---- | ----------- | -------------|
| startUrls | array | List of [Request](https://sdk.apify.com/docs/api/request#docsNav) objects that will be deeply crawled. The URL can be top level like `https://www.imdb.com/search/title/` or `https://www.imdb.com/find` or detail URL `https://www.imdb.com/title/tt7286456`. | `[{ "url": "https://www.imdb.com/search/title/" }]`|
| maxItems | number | Maximum number of actor pages that will be scraped | all found |
| extendOutputFunction | string | Function that takes a Cheerio handle ($) as argument and returns data that will be merged with the result output. More information in [Extend output function](#extend-output-function) | |
| proxyConfiguration | object | Proxy settings of the run. If you have access to Apify proxy, leave the default settings. If not, you can set `{ "useApifyProxy": false" }` to disable proxy usage | `{ "useApifyProxy": true }`|

### Output

Output is stored in a dataset. Each item is an information about a movies/TV show. Example:

```
{
  "title": "Turandot (1981)",
  "original title": "",
  "runtime": "",
  "certificate": "",
  "year": "1981",
  "rating": "",
  "ratingcount": "",
  "description": "",
  "stars": "Montserrat Caballé, Rémy Corazza, Fernand Dumont",
  "director": "Pierre Desfons",
  "genre": "Musical",
  "country": "France",
  "url": "https://www.imdb.com/title/tt0834174"
}
```

### Compute units consumption
Keep in mind that it is much more efficient to run one longer scrape (at least one minute) than more shorter ones because of the startup time.

The average consumption is **1 Compute unit for 1000 actor pages** scraped

### Extend output function

You can use this function to update the result output of this actor. This function gets a Cheerio handle `$` as an argument so you can choose what data from the page you want to scrape. The output from this will function will get merged with the result output.

The return value of this function has to be an object!

You can return fields to achive 3 different things:
- Add a new field - Return object with a field that is not in the result output
- Change a field - Return an existing field with a new value
- Remove a field - Return an existing field with a value `undefined`


```
($) => {
    return {
        "story line": $('#titleStoryLine div p span').text().trim(),
        "original title": "NA",
        url: undefined
    }
}
```
This example will add a new field `story line`, change the `original title` field and remove `url` field
```
{
  "title": "Turandot (1981)",
  "story line": "",
  "original title": "NA",
  "runtime": "",
  "certificate": "",
  "year": "1981",
  "rating": "",
  "ratingcount": "",
  "description": "",
  "stars": "Montserrat Caballé, Rémy Corazza, Fernand Dumont",
  "director": "Pierre Desfons",
  "genre": "Musical",
  "country": "France"
}
```

### Epilogue
Thank you for trying my actor. I will be very glad for a feedback that you can send to my email `dtrungtin@gmail.com`. If you find any bug, please create an issue on the [Github page](https://github.com/dtrungtin/actor-imdb-scraper).