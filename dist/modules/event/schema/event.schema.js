"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventModel = exports.Event = void 0;
const shared_1 = require("@hoizr-technology/shared");
Object.defineProperty(exports, "Event", { enumerable: true, get: function () { return shared_1.Event; } });
const typegoose_1 = require("@typegoose/typegoose");
const EventModel = (0, typegoose_1.getModelForClass)(shared_1.Event, {
    schemaOptions: { timestamps: true, collection: "events" },
});
exports.EventModel = EventModel;
