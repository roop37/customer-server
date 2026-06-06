"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicArtistOrOrganizerEvents = exports.PublicEventSummary = exports.PublicEventPeopleResponse = exports.PublicEventOrganizerEntry = exports.PublicEventArtistEntry = exports.PublicEventPaginatedResponse = void 0;
const shared_1 = require("@hoizr-technology/shared");
const type_graphql_1 = require("type-graphql");
let PublicEventPaginatedResponse = class PublicEventPaginatedResponse {
};
exports.PublicEventPaginatedResponse = PublicEventPaginatedResponse;
__decorate([
    (0, type_graphql_1.Field)(() => [shared_1.Event]),
    __metadata("design:type", Array)
], PublicEventPaginatedResponse.prototype, "events", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], PublicEventPaginatedResponse.prototype, "total", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], PublicEventPaginatedResponse.prototype, "page", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => type_graphql_1.Int),
    __metadata("design:type", Number)
], PublicEventPaginatedResponse.prototype, "pageSize", void 0);
exports.PublicEventPaginatedResponse = PublicEventPaginatedResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], PublicEventPaginatedResponse);
/**
 * Lineup artist or phantom-artist record collapsed into a single shape
 * that the customer event page can render side by side. `isPhantom`
 * flags entries that exist only in the EventLineupArtist + PhantomArtist
 * collections (no public Artist account) — the UI uses it to decide
 * whether the card is clickable through to /artist/<slug>.
 */
let PublicEventArtistEntry = class PublicEventArtistEntry {
};
exports.PublicEventArtistEntry = PublicEventArtistEntry;
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventArtistEntry.prototype, "_id", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], PublicEventArtistEntry.prototype, "name", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventArtistEntry.prototype, "picture", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventArtistEntry.prototype, "tagline", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventArtistEntry.prototype, "bio", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventArtistEntry.prototype, "slug", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventArtistEntry.prototype, "instagramLink", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventArtistEntry.prototype, "spotifyLink", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventArtistEntry.prototype, "youtubeLink", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], PublicEventArtistEntry.prototype, "isPhantom", void 0);
exports.PublicEventArtistEntry = PublicEventArtistEntry = __decorate([
    (0, type_graphql_1.ObjectType)()
], PublicEventArtistEntry);
/**
 * Event organizer (main host) + collaborators collapsed to one shape.
 * `isPrimary` is true exactly once per event (the host that owns the
 * event); the rest are collaborators ordered as they were added.
 */
let PublicEventOrganizerEntry = class PublicEventOrganizerEntry {
};
exports.PublicEventOrganizerEntry = PublicEventOrganizerEntry;
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventOrganizerEntry.prototype, "_id", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], PublicEventOrganizerEntry.prototype, "name", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventOrganizerEntry.prototype, "logo", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventOrganizerEntry.prototype, "description", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventOrganizerEntry.prototype, "city", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Boolean),
    __metadata("design:type", Boolean)
], PublicEventOrganizerEntry.prototype, "isPrimary", void 0);
exports.PublicEventOrganizerEntry = PublicEventOrganizerEntry = __decorate([
    (0, type_graphql_1.ObjectType)()
], PublicEventOrganizerEntry);
let PublicEventPeopleResponse = class PublicEventPeopleResponse {
};
exports.PublicEventPeopleResponse = PublicEventPeopleResponse;
__decorate([
    (0, type_graphql_1.Field)(() => [PublicEventArtistEntry]),
    __metadata("design:type", Array)
], PublicEventPeopleResponse.prototype, "artists", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [PublicEventOrganizerEntry]),
    __metadata("design:type", Array)
], PublicEventPeopleResponse.prototype, "organizers", void 0);
exports.PublicEventPeopleResponse = PublicEventPeopleResponse = __decorate([
    (0, type_graphql_1.ObjectType)()
], PublicEventPeopleResponse);
/**
 * Slim event summary used by the lineup/organizer mini-profile modal.
 * Bigger than a card preview but smaller than the full Event doc —
 * just enough to render a 2-up grid of "past + upcoming events for
 * this artist / this organiser" without paying for the full schema.
 */
let PublicEventSummary = class PublicEventSummary {
};
exports.PublicEventSummary = PublicEventSummary;
__decorate([
    (0, type_graphql_1.Field)(() => String),
    __metadata("design:type", String)
], PublicEventSummary.prototype, "_id", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventSummary.prototype, "title", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventSummary.prototype, "slug", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventSummary.prototype, "eventFlyer", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventSummary.prototype, "horizontalFlyer", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => String, { nullable: true }),
    __metadata("design:type", String)
], PublicEventSummary.prototype, "city", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => Date, { nullable: true }),
    __metadata("design:type", Date)
], PublicEventSummary.prototype, "startDate", void 0);
exports.PublicEventSummary = PublicEventSummary = __decorate([
    (0, type_graphql_1.ObjectType)()
], PublicEventSummary);
let PublicArtistOrOrganizerEvents = class PublicArtistOrOrganizerEvents {
};
exports.PublicArtistOrOrganizerEvents = PublicArtistOrOrganizerEvents;
__decorate([
    (0, type_graphql_1.Field)(() => [PublicEventSummary]),
    __metadata("design:type", Array)
], PublicArtistOrOrganizerEvents.prototype, "upcoming", void 0);
__decorate([
    (0, type_graphql_1.Field)(() => [PublicEventSummary]),
    __metadata("design:type", Array)
], PublicArtistOrOrganizerEvents.prototype, "past", void 0);
exports.PublicArtistOrOrganizerEvents = PublicArtistOrOrganizerEvents = __decorate([
    (0, type_graphql_1.ObjectType)()
], PublicArtistOrOrganizerEvents);
