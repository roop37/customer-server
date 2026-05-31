"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventModel = exports.Event = exports.PhantomArtistModel = exports.HostModel = void 0;
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "Event", { enumerable: true, get: function () { return shared_1.Event; } });
const typegoose_1 = require("@typegoose/typegoose");
const EventModel = (0, typegoose_1.getModelForClass)(shared_1.Event, {
    schemaOptions: { timestamps: true, collection: "events" },
});
exports.EventModel = EventModel;
// People-of-event resolves lineup → Artist (already exposed via
// ArtistModel in the artistFollow module) and PhantomArtist + Host
// here so the customer event page can show artists, organizer, and
// collaborators in a single query.
exports.HostModel = (0, typegoose_1.getModelForClass)(shared_1.Host, {
    schemaOptions: { timestamps: true },
});
exports.PhantomArtistModel = (0, typegoose_1.getModelForClass)(shared_1.PhantomArtist, {
    schemaOptions: { timestamps: true },
});
