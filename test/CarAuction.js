/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const AdminConnection = require('@ibm/concerto-admin').AdminConnection;
const BusinessNetworkConnection = require('@ibm/concerto-client').BusinessNetworkConnection;
const BusinessNetworkDefinition = require('@ibm/concerto-common').BusinessNetworkDefinition;
const path = require('path');

require('chai').should();

const NS = 'org.acme.vehicle.auction';

describe('CarAuction', () => {

    let adminConnection;
    let businessNetworkConnection;

    before(() => {
        adminConnection = new AdminConnection();
        return adminConnection.createProfile('testprofile', {
            type: 'embedded'
        })
            .then(() => {
                return adminConnection.connect('testprofile', 'WebAppAdmin', 'DJY27pEnl16d');
            })
            .then(() => {
                return BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
            })
            .then((businessNetworkDefinition) => {
                return adminConnection.deploy(businessNetworkDefinition);
            })
            .then(() => {
                businessNetworkConnection = new BusinessNetworkConnection();
                return businessNetworkConnection.connect('testprofile', '@ibm/carauction-network', 'WebAppAdmin', 'DJY27pEnl16d');
            });
    });

    describe('#makeOffer', () => {

        it('should add the offer to the offers of a vehicle listing', () => {

            const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

            // create the seller
            const seller = factory.newInstance(NS, 'User', 'daniel.selman@uk.ibm.com');
            seller.firstName = 'Dan';
            seller.lastName = 'Selman';
            seller.balance = 0;

            // create the vehicle
            const vehicle = factory.newInstance(NS, 'Vehicle', 'CAR_001');
            vehicle.owner = factory.newRelationship(NS, 'User', seller.$identifier);

            // create the vehicle listing
            const listing = factory.newInstance(NS, 'VehicleListing', 'LISTING_001');
            listing.reservePrice = 100;
            listing.description = 'My nice car';
            listing.state = 'FOR_SALE';
            listing.vehicle = factory.newRelationship(NS, 'Vehicle', 'CAR_001');

            // create the buyer
            const buyer = factory.newInstance(NS, 'User', 'sstone1@uk.ibm.com');
            buyer.firstName = 'Simon';
            buyer.lastName = 'Stone';
            buyer.balance = 1000;

            // create another potential buyer
            const buyer2 = factory.newInstance(NS, 'User', 'whitemat@uk.ibm.com');
            buyer2.firstName = 'Matthew';
            buyer2.lastName = 'White';
            buyer2.balance = 100;

            const offer = factory.newTransaction(NS, 'Offer');
            offer.user = factory.newRelationship(NS, 'User', buyer.$identifier);
            offer.listing = factory.newRelationship(NS, 'VehicleListing', 'LISTING_001');
            offer.bidPrice = 200;

            // Get the asset registry.
            return businessNetworkConnection.getAssetRegistry(NS + '.Vehicle')
                .then((vehicleRegistry) => {

                    // Add the Vehicle to the asset registry.
                    return vehicleRegistry.add(vehicle)
                        .then(() => {
                            // Add the VehicleListing to the asset registry
                            return businessNetworkConnection.getAssetRegistry(NS + '.VehicleListing');
                        })
                        .then((vehicleListingRegistry) => {
                            // add the vehicle listing
                            return vehicleListingRegistry.add(listing);
                        })
                        .then(() => {
                            return businessNetworkConnection.getParticipantRegistry(NS + '.User');
                        })
                        .then((userRegistry) => {
                            // add the buyer, buyer2 and seller
                            return userRegistry.addAll([buyer, buyer2, seller]);
                        })
                        .then(() => {
                            // Create the offer transaction and submit
                            return businessNetworkConnection.submitTransaction(offer);
                        })
                        .then(() => {
                            const lowOffer = factory.newTransaction(NS, 'Offer');
                            lowOffer.user = factory.newRelationship(NS, 'User', buyer2.$identifier);
                            lowOffer.listing = factory.newRelationship(NS, 'VehicleListing', 'LISTING_001');
                            lowOffer.bidPrice = 50;
                            // Create the offer transaction and submit
                            return businessNetworkConnection.submitTransaction(lowOffer);
                        })
                        .then(() => {
                            return businessNetworkConnection.getAssetRegistry(NS + '.VehicleListing');
                        })
                        .then((vehicleListingRegistry) => {
                            // get the listing
                            return vehicleListingRegistry.get(listing.$identifier);
                        })
                        .then((newListing) => {
                            // both offers should have been added to the listing
                            newListing.offers.length.should.equal(2);
                        })
                        .then(() => {
                            // close the bidding
                            const closeBidding = factory.newTransaction(NS, 'CloseBidding');
                            closeBidding.listing = factory.newRelationship(NS, 'VehicleListing', 'LISTING_001');
                            return businessNetworkConnection.submitTransaction(closeBidding);
                        })
                        .then(() => {
                            return businessNetworkConnection.getAssetRegistry(NS + '.VehicleListing');
                        })
                        .then((vehicleListingRegistry) => {
                            // get the listing
                            return vehicleListingRegistry.get(listing.$identifier);
                        })
                        .then((newListing) => {
                            // the offer should have been added to the listing
                            newListing.state.should.equal('SOLD');
                        })
                        .then(() => {
                            return businessNetworkConnection.getParticipantRegistry(NS + '.User');
                        })
                        .then((userRegistry) => {
                            // add the buyer and seller
                            return userRegistry.get(buyer.$identifier);
                        })
                        .then((buyer) => {
                            // check the buyer's balance
                            buyer.balance.should.equal(800);
                        })
                        .then(() => {
                            return businessNetworkConnection.getParticipantRegistry(NS + '.User');
                        })
                        .then((userRegistry) => {
                            // add the buyer and seller
                            return userRegistry.get(seller.$identifier);
                        })
                        .then((newSeller) => {
                            // check the seller's balance
                            newSeller.balance.should.equal(200);
                        })
                        .then(() => {
                            return businessNetworkConnection.getParticipantRegistry(NS + '.User');
                        })
                        .then((userRegistry) => {
                            // add the buyer and seller
                            return userRegistry.get(buyer.$identifier);
                        })
                        .then((newBuyer) => {
                            // check the buyer's balance
                            newBuyer.balance.should.equal(800);
                        })
                        .then(() => {
                            return businessNetworkConnection.getAssetRegistry(NS + '.Vehicle');
                        })
                        .then((vehicleRegistry) => {
                            // get the vehicle
                            return vehicleRegistry.get(vehicle.$identifier);
                        })
                        .then((newVehicle) => {
                            // check that the buyer now owns the car
                            newVehicle.owner.getIdentifier().should.equal(buyer.$identifier);
                        });
                });
        });
    });
});
