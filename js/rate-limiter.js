class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }

    canMakeRequest() {
        const now = Date.now;
        this.requests = this.requests.filter(time => now - time < this.timeWindow);
        if (this.requests.length < this.maxRequests) {
            this.requests.push(now);
            return true;
        }
        return false;
    }
}

const rateLimiters = {
  search: new RateLimiter(10, 60000),
  post: new RateLimiter(5, 60000),
  comment: new RateLimiter(10, 60000),
  like: new RateLimiter(20, 60000),
};